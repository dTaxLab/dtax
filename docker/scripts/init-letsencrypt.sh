#!/bin/bash
# 首次部署时申请 Let's Encrypt SSL 证书
# 用法: ./docker/scripts/init-letsencrypt.sh [email] [domain]
#   email  — Let's Encrypt 注册邮箱（必需）
#   domain — 域名，默认 getdtax.com

set -euo pipefail

EMAIL="${1:?用法: $0 <email> [domain]}"
DOMAIN="${2:-getdtax.com}"
COMPOSE="docker compose"
DATA_PATH="letsencrypt"

# 1. 如果证书已存在则跳过
if $COMPOSE run --rm certbot certificates 2>/dev/null | grep -q "Certificate Name: $DOMAIN"; then
  echo "证书已存在，跳过申请。如需续期请运行: docker compose run --rm certbot renew"
  exit 0
fi

# 2. 生成临时自签名证书，让 nginx 先启动
echo ">>> 生成临时自签名证书 ..."
$COMPOSE run --rm --entrypoint "\
  mkdir -p /etc/letsencrypt/live/$DOMAIN && \
  openssl req -x509 -nodes -newkey rsa:2048 -days 1 \
    -keyout /etc/letsencrypt/live/$DOMAIN/privkey.pem \
    -out    /etc/letsencrypt/live/$DOMAIN/fullchain.pem \
    -subj '/CN=localhost'" certbot

# 3. 启动 nginx（使用临时证书）
echo ">>> 启动 nginx ..."
$COMPOSE up -d nginx

# 4. 删除临时证书
echo ">>> 删除临时证书 ..."
$COMPOSE run --rm --entrypoint "\
  rm -rf /etc/letsencrypt/live/$DOMAIN && \
  rm -rf /etc/letsencrypt/archive/$DOMAIN && \
  rm -rf /etc/letsencrypt/renewal/$DOMAIN.conf" certbot

# 5. 申请真实证书
echo ">>> 向 Let's Encrypt 申请证书 ..."
$COMPOSE run --rm certbot certonly --webroot \
  -w /var/www/certbot \
  --email "$EMAIL" \
  -d "$DOMAIN" \
  --rsa-key-size 4096 \
  --agree-tos \
  --no-eff-email \
  --force-renewal

# 6. 重启 nginx 加载真实证书
echo ">>> 重新加载 nginx ..."
$COMPOSE exec nginx nginx -s reload

echo ">>> 完成！SSL 证书已配置: $DOMAIN"
