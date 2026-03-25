# dTax 云服务器部署更新指南

> **给 dtax-ops Claude Code**：当需要更新云服务器上的 dTax 部署时，按此文档操作。

## 服务器信息

- **服务器**: Oracle Cloud（具体 IP 见 `.env` 或运维文档）
- **域名**: getdtax.com
- **SSH**: `ssh <user>@<server-ip>`
- **项目路径**: 服务器上的 dtax 仓库克隆位置
- **Docker Compose**: 在项目根目录运行

## 更新类型判断

### 类型 A：仅博客内容更新（最常见，无需重建）

**触发条件**: ops 仓库生成了新博客，已 push 到 dtax-private

```bash
ssh <user>@<server-ip>
cd /path/to/dtax
git pull origin main
# 完成！博客 volume 挂载 + force-dynamic，下次访问自动生效
```

**原理**: `docker-compose.yml` 把 `./apps/web/content/blog` 挂载到容器，`blog.ts` 运行时读取文件。

### 类型 B：前端代码更新（需要重建 Web 镜像）

**触发条件**: 修改了 `apps/web/src/` 下的代码、CSS、组件、翻译文件

```bash
ssh <user>@<server-ip>
cd /path/to/dtax
git pull origin main
docker compose build web
docker compose up -d web
```

**注意**: 如果修改了 `NEXT_PUBLIC_*` 环境变量，必须在 `docker compose build` 前设置到 `.env`。

### 类型 C：API 代码更新（需要重建 API 镜像）

**触发条件**: 修改了 `apps/api/src/` 下的代码

```bash
ssh <user>@<server-ip>
cd /path/to/dtax
git pull origin main
docker compose build api
docker compose up -d api
```

### 类型 D：API 运行时配置更新（仅重启）

**触发条件**: 修改了 `.env` 中的 API 变量（非 NEXT*PUBLIC*\*）

```bash
ssh <user>@<server-ip>
cd /path/to/dtax
# 编辑 .env
docker compose restart api
```

### 类型 E：全量更新（代码 + 配置都变了）

```bash
ssh <user>@<server-ip>
cd /path/to/dtax
git pull origin main
docker compose build web api
docker compose up -d
```

### 类型 F：数据库迁移

**触发条件**: `apps/api/prisma/schema.prisma` 有变更

```bash
ssh <user>@<server-ip>
cd /path/to/dtax
git pull origin main
docker compose build api
docker compose up -d    # migrate 服务自动运行
```

## 新增的环境变量清单（本次会话）

以下变量需要在服务器 `.env` 中配置：

```bash
# Cloudflare Turnstile CAPTCHA
TURNSTILE_SECRET_KEY=0x4AAAAAACvVv2UD7aw1ko3kbA_MV-8FzHc

# Turnstile 前端（构建时变量，需要 docker compose build web）
NEXT_PUBLIC_TURNSTILE_SITE_KEY=0x4AAAAAACvVv--h4YtlF8kp
```

## 验证部署

```bash
# 1. 检查所有服务运行状态
docker compose ps

# 2. API 健康检查
curl -s https://getdtax.com/api/health

# 3. 检查博客数量
curl -s https://getdtax.com/zh/blog | grep -c "post-card"

# 4. 检查 Turnstile
curl -sI https://getdtax.com/zh/auth | grep "Content-Security-Policy" | grep -o "challenges.cloudflare.com"

# 5. 检查浮动 AI 助手
curl -s -X POST https://getdtax.com/api/v1/chat/public \
  -H "Content-Type: application/json" \
  -d '{"message":"hello","locale":"zh"}'
```

## 本次需要执行的更新

这是**类型 E（全量更新）**，因为本次会话修改了：

1. **前端代码**: 浮动 AI 助手、Turnstile CAPTCHA、UI 改进、i18n SEO、scroll reveal、CSP 等
2. **API 代码**: 公开 chat endpoint、博客知识库注入、Ollama tool call 解析器、maxTokens、Turnstile 验证
3. **Docker 配置**: blog volume 挂载、Dockerfile 增加 content/blog 复制
4. **新环境变量**: TURNSTILE_SECRET_KEY、NEXT_PUBLIC_TURNSTILE_SITE_KEY

### 执行步骤

```bash
# 1. SSH 到服务器
ssh <user>@<server-ip>

# 2. 拉取代码
cd /path/to/dtax
git pull origin main

# 3. 添加新环境变量
echo "" >> .env
echo "# Cloudflare Turnstile" >> .env
echo "TURNSTILE_SECRET_KEY=0x4AAAAAACvVv2UD7aw1ko3kbA_MV-8FzHc" >> .env
echo "NEXT_PUBLIC_TURNSTILE_SITE_KEY=0x4AAAAAACvVv--h4YtlF8kp" >> .env

# 4. 重建所有镜像
docker compose build web api

# 5. 启动（migrate 自动运行）
docker compose up -d

# 6. 验证
docker compose ps
curl -s https://getdtax.com/api/health
```

## 自动化博客更新（可选）

在服务器上设置 cron 每小时自动 pull：

```bash
# 每小时从 GitHub 拉取最新博客内容
echo "0 * * * * cd /path/to/dtax && git pull origin main --quiet" | crontab -
```

或使用 GitHub webhook + 简单脚本自动触发。
