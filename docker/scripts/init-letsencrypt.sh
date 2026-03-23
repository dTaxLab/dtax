#!/bin/bash
# 首次部署时申请 Let's Encrypt SSL 证书
# 用法: ./docker/scripts/init-letsencrypt.sh <email> [domain]
#   email  — Let's Encrypt 注册邮箱（必需）
#   domain — 域名，默认 getdtax.com
#
# 前置条件：
#   1. DNS 已将域名解析到本机 IP
#   2. 80 端口已开放（防火墙 + 安全组）
#   3. docker compose pull 已执行（镜像已拉取）

set -euo pipefail

EMAIL="${1:?用法: $0 <email> [domain]}"
DOMAIN="${2:-getdtax.com}"

echo ">>> [1/5] 生成临时自签名证书 ..."
docker run --rm \
  -v dtax_letsencrypt:/etc/letsencrypt \
  --entrypoint sh certbot/certbot -c "\
    mkdir -p /etc/letsencrypt/live/$DOMAIN && \
    openssl req -x509 -nodes -newkey rsa:2048 -days 1 \
      -keyout /etc/letsencrypt/live/$DOMAIN/privkey.pem \
      -out    /etc/letsencrypt/live/$DOMAIN/fullchain.pem \
      -subj '/CN=localhost'"

echo ">>> [2/5] 启动 nginx（临时证书，仅用于 ACME 验证）..."
docker run -d --name dtax-nginx-init \
  -p 80:80 -p 443:443 \
  -v "$(pwd)/docker/nginx/nginx.conf:/etc/nginx/conf.d/default.conf:ro" \
  -v "$(pwd)/docker/nginx/ssl-params.conf:/etc/nginx/snippets/ssl-params.conf:ro" \
  -v dtax_certbot-data:/var/www/certbot:ro \
  -v dtax_letsencrypt:/etc/letsencrypt:ro \
  nginx:alpine

# 等待 nginx 就绪
for i in $(seq 1 10); do
  if docker exec dtax-nginx-init nginx -t 2>/dev/null; then
    echo "nginx 已就绪"
    break
  fi
  echo "等待 nginx... ($i/10)"
  sleep 2
done

if ! docker ps | grep -q dtax-nginx-init; then
  echo "错误：nginx 启动失败，查看日志："
  docker logs dtax-nginx-init 2>&1 | tail -10
  docker rm -f dtax-nginx-init 2>/dev/null
  exit 1
fi

echo ">>> [3/5] 删除临时证书 ..."
docker run --rm \
  -v dtax_letsencrypt:/etc/letsencrypt \
  --entrypoint sh certbot/certbot -c "\
    rm -rf /etc/letsencrypt/live/$DOMAIN && \
    rm -rf /etc/letsencrypt/archive/$DOMAIN && \
    rm -rf /etc/letsencrypt/renewal/$DOMAIN.conf"

# 确认 nginx 还活着（删除证书后 nginx 不会自动重载，进程仍在运行）
if ! docker ps | grep -q dtax-nginx-init; then
  echo "错误：nginx 已停止，无法完成 ACME 验证"
  docker rm -f dtax-nginx-init 2>/dev/null
  exit 1
fi

echo ">>> [4/5] 向 Let's Encrypt 申请证书 ..."
docker run --rm \
  -v dtax_certbot-data:/var/www/certbot \
  -v dtax_letsencrypt:/etc/letsencrypt \
  certbot/certbot certonly --webroot \
    -w /var/www/certbot \
    --email "$EMAIL" \
    -d "$DOMAIN" \
    --rsa-key-size 4096 \
    --agree-tos \
    --no-eff-email \
    --force-renewal

# 验证证书文件是否存在
docker run --rm \
  -v dtax_letsencrypt:/etc/letsencrypt \
  --entrypoint sh certbot/certbot -c \
  "test -f /etc/letsencrypt/live/$DOMAIN/fullchain.pem" || {
    echo "错误：证书申请失败，fullchain.pem 不存在"
    docker rm -f dtax-nginx-init 2>/dev/null
    exit 1
  }

echo ">>> [5/5] 清理临时 nginx ..."
docker rm -f dtax-nginx-init 2>/dev/null

echo ""
echo ">>> 完成！SSL 证书已配置: $DOMAIN"
echo ">>> 现在可以运行: docker compose up -d"
