# dTax 云服务器部署运维手册

## 服务器信息

- **服务器**: Oracle Cloud
- **域名**: getdtax.com
- **项目路径**: `/data/dtax`（dtax-private 源码仓库）
- **SSH**: `ssh root@<server-ip>`

---

## 架构说明

```
/data/dtax/                          ← git clone dtax-private
├── .env                             ← 生产环境变量（chmod 600）
├── .maintenance                     ← 维护模式标记（存在时暂停自动更新）
├── docker-compose.yml               ← image: + build: 模式
├── apps/
│   ├── api/Dockerfile               ← API 镜像（node:24-slim）
│   └── web/Dockerfile               ← Web 镜像（node:24-slim → alpine）
├── scripts/
│   ├── setup-server.sh              ← 一键部署/恢复
│   ├── auto-update.sh               ← 自动更新（cron 调用）
│   ├── maintenance.sh               ← 维护模式管理
│   ├── ghcr-push.py                 ← 推送镜像到 GHCR（可选）
│   └── docker-test.py               ← 镜像测试
├── docker/
│   ├── nginx/nginx.conf             ← Nginx 配置
│   └── scripts/
│       ├── backup.sh                ← 数据库备份
│       └── init-letsencrypt.sh      ← SSL 证书初始化
└── backups/
    ├── dtax_YYYYMMDD_HHMMSS.sql.gz  ← 数据库备份
    ├── auto-update.log              ← 自动更新日志
    └── cron.log                     ← 定时任务日志
```

---

## 首次部署

```bash
# 1. clone 源码
cd /data && git clone https://github.com/dTaxLab/dtax-private.git dtax

# 2. 配置环境变量
cd /data/dtax
cp .env.production.example .env
nano .env    # 填入所有密钥

# 3. 一键部署（构建镜像 + SSL证书 + 启动服务 + 配置定时任务）
bash scripts/setup-server.sh
```

一条命令完成所有配置，后续无需手动干预。

---

## 自动化任务

以下任务由 `setup-server.sh` 自动配置到 cron，无需手动管理：

| 时间 | 任务 | 说明 |
|------|------|------|
| 每小时 :30 | 自动更新 | 拉取代码，按需构建镜像、迁移、重启 |
| 每天 02:00 | 数据库备份 | pg_dump 压缩，自动清理 30 天前备份 |
| 每周一 03:00 | Nginx 重载 | 让 SSL 证书续期生效 |
| 每周日 04:00 | 清理旧数据 | 删除 7 天前镜像 + 截断大日志 |
| 持续运行 | SSL 续期 | certbot 容器每 12 小时检查 |

### 自动更新智能判断

`auto-update.sh` 每小时 :30 运行，根据代码变更类型自动决定操作：

| 变更内容 | 自动操作 |
|---------|---------|
| 无更新 | 跳过 |
| 仅博客文件 | 跳过构建（volume 挂载自动生效） |
| API / packages 代码 | 备份 DB → 构建 API → 重启 API |
| Web 前端代码 | 构建 Web → 重启 Web |
| 数据库迁移文件 | 备份 DB → 构建 API → 执行迁移 → 重启 |
| Docker 配置 | 备份 DB → 构建全部 → 重启全部 |

### 安全机制

- **锁文件**：防止并发执行
- **维护模式**：人工操作时暂停自动更新
- **迁移前备份**：检测到迁移文件时自动备份
- **构建失败不重启**：失败则退出，不影响运行中的服务
- **健康检查**：重启后自动验证 API 是否正常

---

## 人工运维

### 开启维护模式

进行任何手动操作前，先暂停自动更新：

```bash
cd /data/dtax
bash scripts/maintenance.sh on      # 开启（暂停自动更新）

# ... 做操作 ...

bash scripts/maintenance.sh off     # 关闭（恢复自动更新）
bash scripts/maintenance.sh status  # 查看状态
```

### 手动更新类型

#### 博客更新（无需重建）

```bash
bash scripts/maintenance.sh on
git pull
bash scripts/maintenance.sh off
# 博客通过 volume 挂载，拉取后自动生效
```

#### 前端代码更新

```bash
bash scripts/maintenance.sh on
git pull
docker compose build web
docker compose up -d web
bash scripts/maintenance.sh off
```

> `NEXT_PUBLIC_*` 变量改了必须重新 build web。

#### API 代码更新

```bash
bash scripts/maintenance.sh on
git pull
docker compose build api
docker compose up -d api
bash scripts/maintenance.sh off
```

#### 数据库迁移

```bash
bash scripts/maintenance.sh on
./docker/scripts/backup.sh ./backups     # 必须先备份！
git pull
docker compose build api
docker compose run --rm migrate
docker compose up -d
docker compose ps
curl -s https://getdtax.com/api/health
bash scripts/maintenance.sh off
```

#### 全量更新

```bash
bash scripts/maintenance.sh on
./docker/scripts/backup.sh ./backups
git pull
nano .env                                # 如有新变量
docker compose build api web
docker compose up -d
docker compose ps
curl -s https://getdtax.com/api/health
bash scripts/maintenance.sh off
```

#### 环境变量变更

```bash
nano .env
# 运行时变量 → 重启即可
docker compose restart api

# NEXT_PUBLIC_* → 必须重建 Web 镜像
docker compose build web
docker compose up -d web
```

#### Nginx 配置变更

```bash
git pull
docker exec dtax-nginx-1 nginx -t         # 测试语法
docker exec dtax-nginx-1 nginx -s reload   # 热重载
```

### 回滚

```bash
bash scripts/maintenance.sh on

# 备份当前数据
./docker/scripts/backup.sh ./backups

# 回退代码
git log --oneline -5
git checkout <旧commit-hash>

# 重建并启动
docker compose build api web
docker compose up -d

# 如需回滚数据库
docker compose stop api web
gunzip -c backups/dtax_回滚前备份.sql.gz | docker compose exec -T postgres psql -U dtax dtax
docker compose start api web

bash scripts/maintenance.sh off
```

### 故障恢复

服务器出问题后，重新执行一键部署脚本即可恢复：

```bash
cd /data/dtax
bash scripts/setup-server.sh
```

---

## 日常运维命令

```bash
cd /data/dtax

# ---- 状态 ----
docker compose ps                          # 服务状态
docker compose logs --tail=50 api          # API 日志
docker compose logs -f api                 # 实时跟踪
tail -f backups/auto-update.log            # 自动更新日志
tail -f backups/cron.log                   # 定时任务日志

# ---- 服务 ----
docker compose restart api                 # 重启 API
docker compose restart web                 # 重启 Web
docker compose restart nginx               # 重启 Nginx

# ---- 备份 ----
./docker/scripts/backup.sh ./backups       # 手动备份
ls -lh backups/                            # 查看备份

# ---- 数据库 ----
docker compose exec postgres psql -U dtax dtax   # 进入数据库

# ---- 磁盘 ----
df -h                                      # 磁盘使用
docker system df                           # Docker 占用
docker image prune -f                      # 清理旧镜像

# ---- SSL ----
docker compose run --rm certbot certificates     # 查看证书状态
docker compose run --rm certbot renew            # 手动续期
docker exec dtax-nginx-1 nginx -s reload         # 重载证书

# ---- GHCR（可选）----
python3 scripts/ghcr-push.py               # 构建并推送到 GHCR
python3 scripts/ghcr-push.py --push-only   # 仅推送
```

> **严禁** `docker compose down -v`（删除所有数据卷包括数据库）

---

## 验证部署

```bash
# 服务状态
docker compose ps

# API 健康检查
curl -s https://getdtax.com/api/health
curl -s https://getdtax.com/api/health/deep

# Web 页面
curl -sI https://getdtax.com

# 直接测试 API（绕过 Nginx）
docker exec dtax-api-1 node -e "fetch('http://localhost:3001/api/health').then(r=>r.json()).then(console.log)"
```

---

## 注意事项

| 项目 | 说明 |
|------|------|
| 人工操作前 | 先 `bash scripts/maintenance.sh on` 暂停自动更新 |
| 数据库迁移 | 不可逆，**必须先备份** |
| `NEXT_PUBLIC_*` | 烘焙在 Web 镜像中，改了必须 `docker compose build web` |
| 运行时变量 | 改 `.env` 后 `docker compose restart api` 即可 |
| 博客更新 | `git pull` 自动生效，不需要重建镜像 |
| Nginx | 改了先 `nginx -t` 测试，再 `nginx -s reload` |
| 回滚 | 代码用 `git checkout`，数据库只能从备份恢复 |
| 故障恢复 | `bash scripts/setup-server.sh` 一键恢复 |

---

## 自动清理策略

| 清理对象 | 策略 | 触发时间 |
|---------|------|---------|
| 数据库备份 | 保留 30 天 | 每次备份时清理 |
| Docker 旧镜像 | 保留 7 天 | 每周日 04:00 |
| auto-update.log | 超 5000 行轮转为 2000 行 | 每次自动更新时 |
| cron.log | 超 10MB 截断为 1MB | 每周日 04:00 |
| SSL 证书 | Let's Encrypt 自动续期 | certbot 持续运行 |

---

## 故障排查

| 现象 | 排查 | 常见原因 |
|------|------|---------|
| API unhealthy | `docker compose logs api --tail=50` | ENCRYPTION_KEY 格式错误 |
| Web 打不开 | `docker compose logs nginx --tail=50` | SSL 证书不存在 |
| 502/504 | `docker compose ps api` | API 崩溃 |
| 登录 UNAUTHORIZED | `docker compose logs api --tail=10` | Nginx 转发路径错误 |
| 登录 INTERNAL_ERROR | `docker compose run --rm migrate` | 数据库表不存在 |
| 数据库连接失败 | `docker compose exec postgres pg_isready -U dtax` | 密码不一致 |
| 自动更新没生效 | `tail backups/auto-update.log` | 维护模式开着 / 锁文件残留 |
| 磁盘满 | `df -h && docker system df` | `docker image prune -af` |
