#!/bin/bash
# ============================================================================
# dTax 维护模式管理
#
# 用法:
#   bash scripts/maintenance.sh on       # 开启维护模式（暂停自动更新）
#   bash scripts/maintenance.sh off      # 关闭维护模式（恢复自动更新）
#   bash scripts/maintenance.sh status   # 查看当前状态
# ============================================================================

set -euo pipefail

PROJECT_DIR="/data/dtax"
MAINT_FILE="${PROJECT_DIR}/.maintenance"

case "${1:-status}" in
    on|start)
        touch "$MAINT_FILE"
        echo "维护模式: 已开启"
        echo "  自动更新已暂停"
        echo "  完成后运行: bash scripts/maintenance.sh off"
        ;;
    off|stop)
        rm -f "$MAINT_FILE"
        echo "维护模式: 已关闭"
        echo "  自动更新已恢复"
        ;;
    status)
        if [ -f "$MAINT_FILE" ]; then
            echo "维护模式: 开启中"
            echo "  创建时间: $(stat -c '%y' "$MAINT_FILE" 2>/dev/null || stat -f '%Sm' "$MAINT_FILE" 2>/dev/null)"
        else
            echo "维护模式: 关闭"
        fi
        echo ""
        echo "服务状态:"
        cd "$PROJECT_DIR" && docker compose ps --format "table {{.Name}}\t{{.Status}}" 2>/dev/null
        ;;
    *)
        echo "用法: bash scripts/maintenance.sh [on|off|status]"
        exit 1
        ;;
esac
