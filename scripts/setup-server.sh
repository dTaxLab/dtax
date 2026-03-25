#!/bin/bash
# ============================================================================
# dTax 服务器一键部署/恢复脚本
#
# 幂等设计：可重复执行，不会产生副作用
# 适用场景：首次部署、故障恢复、环境重建
#
# 前置条件：
#   1. Ubuntu 22.04/24.04，已安装 Docker + Docker Compose
#   2. 项目已 clone 到 /data/dtax
#   3. .env 已配置好（从 .env.production.example 复制并填写）
#   4. DNS 已将域名解析到本机 IP
#
# 用法: cd /data/dtax && bash scripts/setup-server.sh
# ============================================================================

set -euo pipefail

PROJECT_DIR="/data/dtax"
BACKUP_DIR="${PROJECT_DIR}/backups"
DOMAIN="getdtax.com"
CERT_EMAIL="support@getdtax.com"

# 颜色输出
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

ok()   { echo -e "  ${GREEN}[OK]${NC} $1"; }
warn() { echo -e "  ${YELLOW}[!]${NC} $1"; }
fail() { echo -e "  ${RED}[X]${NC} $1"; exit 1; }

echo ""
echo "================================================"
echo "  dTax 服务器一键部署"
echo "================================================"
echo ""

# ============================================================================
# 1. 检查前置条件
# ============================================================================
echo "[1/8] 检查前置条件..."

[ -d "$PROJECT_DIR" ] || fail "项目目录 $PROJECT_DIR 不存在"
[ -f "$PROJECT_DIR/.env" ] || fail ".env 文件不存在，请先从 .env.production.example 复制并配置"
[ -f "$PROJECT_DIR/docker-compose.yml" ] || fail "docker-compose.yml 不存在"

for cmd in docker git; do
    command -v $cmd &>/dev/null || fail "$cmd 未安装"
done
docker compose version &>/dev/null || fail "docker compose 未安装"

ok "前置条件通过"

# ============================================================================
# 2. 创建目录 + 设置权限
# ============================================================================
echo "[2/8] 创建目录和权限..."

mkdir -p "$BACKUP_DIR"
chmod +x "$PROJECT_DIR/docker/scripts/"*.sh 2>/dev/null || true
chmod +x "$PROJECT_DIR/scripts/"*.sh 2>/dev/null || true
chmod 600 "$PROJECT_DIR/.env"

ok "目录和权限"

# ============================================================================
# 3. 构建镜像
# ============================================================================
echo "[3/8] 构建 Docker 镜像（首次较慢）..."

cd "$PROJECT_DIR"
docker compose build api web

ok "镜像构建完成"

# ============================================================================
# 4. SSL 证书（已有则跳过）
# ============================================================================
echo "[4/8] 检查 SSL 证书..."

# 检查证书是否已存在
CERT_EXISTS=false
if docker run --rm -v dtax_letsencrypt:/etc/letsencrypt alpine \
    test -f "/etc/letsencrypt/live/${DOMAIN}/fullchain.pem" 2>/dev/null; then
    CERT_EXISTS=true
fi

# 也检查项目名前缀的卷（docker compose 创建的卷名可能带前缀）
for vol_prefix in "dtax" "dtax-private" "data_dtax"; do
    if docker run --rm -v "${vol_prefix}_letsencrypt:/etc/letsencrypt" alpine \
        test -f "/etc/letsencrypt/live/${DOMAIN}/fullchain.pem" 2>/dev/null; then
        CERT_EXISTS=true
        break
    fi
done

if [ "$CERT_EXISTS" = true ]; then
    ok "SSL 证书已存在，跳过申请"
else
    warn "SSL 证书不存在，开始申请..."
    bash "$PROJECT_DIR/docker/scripts/init-letsencrypt.sh" "$CERT_EMAIL" "$DOMAIN"
    ok "SSL 证书申请完成"
fi

# ============================================================================
# 5. 启动服务
# ============================================================================
echo "[5/8] 启动服务..."

cd "$PROJECT_DIR"

# 停止已有服务（如果存在）
docker compose down 2>/dev/null || true

# 启动
docker compose up -d

ok "服务已启动"

# ============================================================================
# 6. 等待健康检查
# ============================================================================
echo "[6/8] 等待服务就绪..."

MAX_WAIT=60
WAITED=0

while [ $WAITED -lt $MAX_WAIT ]; do
    # 检查 API
    API_OK=false
    if docker exec dtax-api-1 node -e \
        "fetch('http://localhost:3001/api/health').then(r=>{if(!r.ok)throw 1}).catch(()=>process.exit(1))" \
        2>/dev/null; then
        API_OK=true
    fi

    # 检查 Web
    WEB_OK=false
    if docker exec dtax-web-1 wget -qO- http://0.0.0.0:3000/ &>/dev/null; then
        WEB_OK=true
    fi

    if [ "$API_OK" = true ] && [ "$WEB_OK" = true ]; then
        break
    fi

    echo "  等待中... (${WAITED}s/${MAX_WAIT}s)"
    sleep 5
    WAITED=$((WAITED + 5))
done

if [ "$API_OK" = true ] && [ "$WEB_OK" = true ]; then
    ok "API 和 Web 均已就绪"
else
    [ "$API_OK" = false ] && warn "API 未就绪，查看日志: docker compose logs api"
    [ "$WEB_OK" = false ] && warn "Web 未就绪，查看日志: docker compose logs web"
fi

# ============================================================================
# 7. 配置定时任务（幂等：先删旧的再加新的）
# ============================================================================
echo "[7/8] 配置定时任务..."

# 导出现有 crontab，移除旧的 dtax 任务和标记
crontab -l 2>/dev/null | grep -v "/data/dtax" | grep -v "dTax" > /tmp/crontab-clean || true

# 添加新任务
cat >> /tmp/crontab-clean << 'CRON'

# ========== dTax 定时任务 ==========
# 每天凌晨 2 点：自动备份数据库（保留 30 天）
0 2 * * * cd /data/dtax && ./docker/scripts/backup.sh /data/dtax/backups >> /data/dtax/backups/cron.log 2>&1
# 每周一凌晨 3 点：重载 Nginx（SSL 证书续期生效）
0 3 * * 1 cd /data/dtax && docker compose exec -T nginx nginx -s reload >> /data/dtax/backups/cron.log 2>&1
# 每小时整点：自动拉取代码（博客 volume 挂载，拉取后自动生效）
0 * * * * cd /data/dtax && git pull --quiet >> /data/dtax/backups/cron.log 2>&1
# 每周日凌晨 4 点：清理 Docker 旧镜像
0 4 * * 0 docker image prune -f >> /data/dtax/backups/cron.log 2>&1
# ========== dTax 定时任务结束 ==========
CRON

crontab /tmp/crontab-clean
rm -f /tmp/crontab-clean

ok "定时任务已配置"

# ============================================================================
# 8. 显示最终状态
# ============================================================================
echo "[8/8] 部署状态..."
echo ""

# 服务状态
echo "  服务:"
docker compose ps --format "table {{.Name}}\t{{.Status}}" 2>/dev/null | while read line; do
    echo "    $line"
done

echo ""
echo "  定时任务:"
echo "    每天 02:00  数据库备份"
echo "    每周一 03:00  Nginx SSL 重载"
echo "    每小时 xx:00  Git 拉取（博客更新）"
echo "    每周日 04:00  Docker 磁盘清理"

# 健康检查
echo ""
echo "  访问地址:"
echo "    https://${DOMAIN}"
echo "    https://${DOMAIN}/api/health"

echo ""
echo "================================================"
echo -e "  ${GREEN}部署完成！${NC}"
echo ""
echo "  故障恢复：重新运行本脚本即可"
echo "    cd /data/dtax && bash scripts/setup-server.sh"
echo ""
echo "  查看日志："
echo "    docker compose logs -f api"
echo "    tail -f backups/cron.log"
echo "================================================"
echo ""
