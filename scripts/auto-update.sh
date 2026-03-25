#!/bin/bash
# ============================================================================
# dTax 自动更新脚本
#
# 拉取最新代码，检测变更类型，按需构建镜像、执行迁移、重启服务
# 带锁机制防止并发执行
#
# 用法: cd /data/dtax && bash scripts/auto-update.sh
# ============================================================================

set -euo pipefail

PROJECT_DIR="/data/dtax"
BACKUP_DIR="${PROJECT_DIR}/backups"
LOG_FILE="${BACKUP_DIR}/auto-update.log"
LOCK_FILE="/tmp/dtax-update.lock"
LOG_MAX_LINES=5000

cd "$PROJECT_DIR"
mkdir -p "$BACKUP_DIR"

log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" >> "$LOG_FILE"; }

# ---- 锁机制：防止并发执行 ----
if [ -f "$LOCK_FILE" ]; then
    LOCK_PID=$(cat "$LOCK_FILE" 2>/dev/null)
    if kill -0 "$LOCK_PID" 2>/dev/null; then
        log "跳过: 上一次更新仍在运行 (PID: $LOCK_PID)"
        exit 0
    else
        rm -f "$LOCK_FILE"
    fi
fi
echo $$ > "$LOCK_FILE"
trap 'rm -f "$LOCK_FILE"' EXIT

# ---- 日志轮转 ----
if [ -f "$LOG_FILE" ] && [ "$(wc -l < "$LOG_FILE")" -gt "$LOG_MAX_LINES" ]; then
    tail -n 2000 "$LOG_FILE" > "${LOG_FILE}.tmp"
    mv "${LOG_FILE}.tmp" "$LOG_FILE"
    log "日志已轮转（保留最近 2000 行）"
fi

# ---- 拉取代码 ----
OLD_COMMIT=$(git rev-parse HEAD)
git pull --quiet 2>>"$LOG_FILE" || { log "ERROR: git pull failed"; exit 1; }
NEW_COMMIT=$(git rev-parse HEAD)

if [ "$OLD_COMMIT" = "$NEW_COMMIT" ]; then
    exit 0
fi

log "代码更新: ${OLD_COMMIT:0:7} -> ${NEW_COMMIT:0:7}"

# ---- 分析变更类型 ----
CHANGED=$(git diff --name-only "$OLD_COMMIT" "$NEW_COMMIT")

NEED_BUILD_API=false
NEED_BUILD_WEB=false
NEED_MIGRATE=false
BLOG_ONLY=true

while IFS= read -r file; do
    case "$file" in
        apps/api/* | packages/shared-types/* | packages/tax-engine/*)
            NEED_BUILD_API=true; BLOG_ONLY=false ;;
        apps/web/content/blog/*)
            ;; # 博客，volume 自动生效
        apps/web/*)
            NEED_BUILD_WEB=true; BLOG_ONLY=false ;;
        docker/* | docker-compose.yml | .env.production.example)
            NEED_BUILD_API=true; NEED_BUILD_WEB=true; BLOG_ONLY=false ;;
        *)
            BLOG_ONLY=false ;;
    esac
done <<< "$CHANGED"

echo "$CHANGED" | grep -q "prisma/migrations/" && NEED_MIGRATE=true

if [ "$BLOG_ONLY" = true ]; then
    log "仅博客更新，volume 自动生效"
    exit 0
fi

# ---- 备份数据库 ----
if [ "$NEED_BUILD_API" = true ] || [ "$NEED_MIGRATE" = true ]; then
    log "备份数据库..."
    ./docker/scripts/backup.sh "$BACKUP_DIR" >> "$LOG_FILE" 2>&1 || log "WARNING: 备份失败"
fi

# ---- 构建镜像 ----
if [ "$NEED_BUILD_API" = true ]; then
    log "构建 API 镜像..."
    docker compose build api >> "$LOG_FILE" 2>&1 || { log "ERROR: API 构建失败"; exit 1; }
    log "API 镜像构建完成"
fi

if [ "$NEED_BUILD_WEB" = true ]; then
    log "构建 Web 镜像..."
    docker compose build web >> "$LOG_FILE" 2>&1 || { log "ERROR: Web 构建失败"; exit 1; }
    log "Web 镜像构建完成"
fi

# ---- 数据库迁移 ----
if [ "$NEED_MIGRATE" = true ]; then
    log "执行数据库迁移..."
    docker compose run --rm migrate >> "$LOG_FILE" 2>&1 || { log "ERROR: 迁移失败"; exit 1; }
    log "数据库迁移完成"
fi

# ---- 重启服务 ----
if [ "$NEED_BUILD_API" = true ] && [ "$NEED_BUILD_WEB" = true ]; then
    log "重启所有服务..."
    docker compose up -d >> "$LOG_FILE" 2>&1
elif [ "$NEED_BUILD_API" = true ]; then
    log "重启 API..."
    docker compose up -d api >> "$LOG_FILE" 2>&1
elif [ "$NEED_BUILD_WEB" = true ]; then
    log "重启 Web..."
    docker compose up -d web >> "$LOG_FILE" 2>&1
fi

# ---- 健康检查 ----
sleep 10
if docker exec dtax-api-1 node -e \
    "fetch('http://localhost:3001/api/health').then(r=>{if(!r.ok)throw 1}).catch(()=>process.exit(1))" \
    2>/dev/null; then
    log "更新完成，服务正常"
else
    log "WARNING: API 健康检查未通过"
fi
