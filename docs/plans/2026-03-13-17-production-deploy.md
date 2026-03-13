# 生产部署指南 & 基础设施 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add production environment validation, nginx reverse proxy with TLS, Docker image CI/CD pipeline, and comprehensive self-hosting deployment guide.

**Architecture:** Harden API startup with required env validation, add nginx container with Let's Encrypt TLS termination, create GitHub Actions workflow to build & push Docker images to GHCR, and write a step-by-step self-hosting guide.

**Tech Stack:** Docker Compose, nginx, certbot/Let's Encrypt, GitHub Container Registry (ghcr.io), Prisma migrations

---

### Task 1: Add Environment Validation on API Startup

**Files:**

- Modify: `apps/api/src/index.ts`

**Step 1: Add required env validation before server starts**

At the top of the `start()` function (before Fastify instance creation), add:

```typescript
// Validate required environment variables in production
if (process.env.NODE_ENV === "production") {
  const required = ["DATABASE_URL", "JWT_SECRET", "ENCRYPTION_KEY"];
  const missing = required.filter((key) => !process.env[key]);
  if (missing.length > 0) {
    console.error(`FATAL: Missing required env vars: ${missing.join(", ")}`);
    process.exit(1);
  }

  // Warn about weak secrets
  if (process.env.JWT_SECRET && process.env.JWT_SECRET.length < 32) {
    console.warn("WARNING: JWT_SECRET should be at least 32 characters");
  }
  if (process.env.ENCRYPTION_KEY && process.env.ENCRYPTION_KEY.length < 32) {
    console.warn("WARNING: ENCRYPTION_KEY should be at least 32 characters");
  }
}
```

**Step 2: Verify dev mode still works (no env validation)**

Run: `pnpm --filter @dtax/api dev` (should start without errors)
Run: `pnpm --filter @dtax/api test`
Expected: 275 tests pass

**Step 3: Commit**

```bash
git add apps/api/src/index.ts
git commit -m "feat(api): add required env validation on production startup"
```

---

### Task 2: Add nginx Reverse Proxy with TLS

**Files:**

- Create: `docker/nginx/nginx.conf`
- Create: `docker/nginx/ssl-params.conf`
- Modify: `docker-compose.yml`

**Step 1: Create nginx config**

Create `docker/nginx/nginx.conf`:

```nginx
upstream api {
    server api:3001;
}

upstream web {
    server web:3000;
}

server {
    listen 80;
    server_name _;

    # Let's Encrypt challenge
    location /.well-known/acme-challenge/ {
        root /var/www/certbot;
    }

    # Redirect all HTTP to HTTPS (enable after cert is obtained)
    # location / {
    #     return 301 https://$host$request_uri;
    # }

    # For initial setup without TLS, proxy directly
    location /api/ {
        proxy_pass http://api/api/;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # SSE support for AI chat streaming
        proxy_buffering off;
        proxy_cache off;
        proxy_read_timeout 300s;
    }

    location / {
        proxy_pass http://web;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}

# TLS server block — uncomment after obtaining certificates
# server {
#     listen 443 ssl http2;
#     server_name your-domain.com;
#
#     ssl_certificate /etc/letsencrypt/live/your-domain.com/fullchain.pem;
#     ssl_certificate_key /etc/letsencrypt/live/your-domain.com/privkey.pem;
#     include /etc/nginx/ssl-params.conf;
#
#     location /api/ {
#         proxy_pass http://api/api/;
#         proxy_set_header Host $host;
#         proxy_set_header X-Real-IP $remote_addr;
#         proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
#         proxy_set_header X-Forwarded-Proto $scheme;
#         proxy_buffering off;
#         proxy_cache off;
#         proxy_read_timeout 300s;
#     }
#
#     location / {
#         proxy_pass http://web;
#         proxy_set_header Host $host;
#         proxy_set_header X-Real-IP $remote_addr;
#         proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
#         proxy_set_header X-Forwarded-Proto $scheme;
#     }
# }
```

**Step 2: Create SSL params**

Create `docker/nginx/ssl-params.conf`:

```nginx
ssl_protocols TLSv1.2 TLSv1.3;
ssl_ciphers ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384;
ssl_prefer_server_ciphers off;
ssl_session_timeout 1d;
ssl_session_cache shared:SSL:10m;

# HSTS
add_header Strict-Transport-Security "max-age=63072000; includeSubDomains" always;

# Security headers
add_header X-Content-Type-Options nosniff always;
add_header X-Frame-Options DENY always;
add_header X-XSS-Protection "1; mode=block" always;
add_header Referrer-Policy strict-origin-when-cross-origin always;
```

**Step 3: Add nginx service to docker-compose.yml**

Add to the `services` section:

```yaml
nginx:
  image: nginx:alpine
  restart: unless-stopped
  ports:
    - "80:80"
    - "443:443"
  volumes:
    - ./docker/nginx/nginx.conf:/etc/nginx/conf.d/default.conf:ro
    - ./docker/nginx/ssl-params.conf:/etc/nginx/ssl-params.conf:ro
    - certbot-data:/var/www/certbot:ro
    - letsencrypt:/etc/letsencrypt:ro
  depends_on:
    api:
      condition: service_healthy
    web:
      condition: service_started
```

Add volumes:

```yaml
volumes:
  postgres-data:
  redis-data:
  certbot-data:
  letsencrypt:
```

Remove port mapping from `api` and `web` services (nginx will proxy):

- Remove `ports: ["3001:3001"]` from api
- Remove `ports: ["3000:3000"]` from web

**Step 4: Commit**

```bash
git add docker/nginx/ docker-compose.yml
git commit -m "feat(infra): add nginx reverse proxy with TLS support"
```

---

### Task 3: Create Docker Image Build & Push CI Workflow

**Files:**

- Create: `.github/workflows/docker.yml`

**Step 1: Create workflow**

```yaml
name: Build & Push Docker Images

on:
  push:
    branches: [main]
    tags: ["v*"]
  workflow_dispatch:

env:
  REGISTRY: ghcr.io
  API_IMAGE: ghcr.io/${{ github.repository }}/api
  WEB_IMAGE: ghcr.io/${{ github.repository }}/web

jobs:
  build-and-push:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      packages: write

    steps:
      - uses: actions/checkout@v4

      - name: Log in to GHCR
        uses: docker/login-action@v3
        with:
          registry: ${{ env.REGISTRY }}
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}

      - name: Set up Docker Buildx
        uses: docker/setup-buildx-action@v3

      - name: Docker meta (API)
        id: meta-api
        uses: docker/metadata-action@v5
        with:
          images: ${{ env.API_IMAGE }}
          tags: |
            type=ref,event=branch
            type=semver,pattern={{version}}
            type=sha,prefix=

      - name: Docker meta (Web)
        id: meta-web
        uses: docker/metadata-action@v5
        with:
          images: ${{ env.WEB_IMAGE }}
          tags: |
            type=ref,event=branch
            type=semver,pattern={{version}}
            type=sha,prefix=

      - name: Build & push API image
        uses: docker/build-push-action@v6
        with:
          context: .
          file: apps/api/Dockerfile
          push: true
          tags: ${{ steps.meta-api.outputs.tags }}
          labels: ${{ steps.meta-api.outputs.labels }}
          cache-from: type=gha
          cache-to: type=gha,mode=max

      - name: Build & push Web image
        uses: docker/build-push-action@v6
        with:
          context: .
          file: apps/web/Dockerfile
          push: true
          tags: ${{ steps.meta-web.outputs.tags }}
          labels: ${{ steps.meta-web.outputs.labels }}
          cache-from: type=gha
          cache-to: type=gha,mode=max
```

**Step 2: Commit**

```bash
git add .github/workflows/docker.yml
git commit -m "ci: add Docker image build & push to GHCR on main/tags"
```

---

### Task 4: Create .env.production Template

**Files:**

- Create: `.env.production.example`

**Step 1: Create comprehensive env template**

```bash
# ============================================================
# DTax Production Environment Configuration
# Copy to .env and fill in all values before running docker compose
# ============================================================

# --- Required ---
NODE_ENV=production
DATABASE_URL=postgresql://dtax:CHANGE_ME@postgres:5432/dtax?schema=public
POSTGRES_PASSWORD=CHANGE_ME
JWT_SECRET=CHANGE_ME_generate_with_openssl_rand_base64_32
ENCRYPTION_KEY=CHANGE_ME_at_least_32_characters

# --- Application URLs ---
HOST=0.0.0.0
PORT=3001
CORS_ORIGIN=https://your-domain.com
APP_URL=https://your-domain.com
NEXT_PUBLIC_API_URL=https://your-domain.com/api

# --- Email (Resend) ---
# Omit to disable email (verification links logged to console)
# RESEND_API_KEY=re_xxxxxxxxxxxx
# FROM_EMAIL=noreply@your-domain.com

# --- Payments (Stripe) ---
# Omit to disable billing (all users treated as FREE plan)
# STRIPE_SECRET_KEY=sk_live_xxxxxxxxxxxx
# STRIPE_WEBHOOK_SECRET=whsec_xxxxxxxxxxxx
# STRIPE_PRO_PRICE_ID=price_xxxxxxxxxxxx
# STRIPE_CPA_PRICE_ID=price_xxxxxxxxxxxx
# WEB_URL=https://your-domain.com

# --- AI Features (Anthropic) ---
# Omit to disable AI classification and chat
# ANTHROPIC_API_KEY=sk-ant-xxxxxxxxxxxx

# --- Blockchain Indexing ---
# Omit to disable wallet sync
# ETHERSCAN_API_KEY=xxxxxxxxxxxx
# SOLSCAN_API_KEY=xxxxxxxxxxxx

# --- Analytics (PostHog) ---
# Omit to disable analytics
# NEXT_PUBLIC_POSTHOG_KEY=phc_xxxxxxxxxxxx
# NEXT_PUBLIC_POSTHOG_HOST=https://us.i.posthog.com

# --- Error Tracking (Sentry) ---
# SENTRY_DSN=https://xxxxxxxxxxxx@sentry.io/xxxxxxxxxxxx
```

**Step 2: Commit**

```bash
git add .env.production.example
git commit -m "docs: add production environment configuration template"
```

---

### Task 5: Write Self-Hosting Deployment Guide

**Files:**

- Create: `docs/self-hosting.md`

**Step 1: Write guide**

````markdown
# DTax Self-Hosting Guide

Deploy DTax on your own server with Docker Compose.

## Prerequisites

- Linux server (Ubuntu 22.04+ recommended) with 2GB+ RAM
- Docker Engine 24+ and Docker Compose v2
- Domain name pointed to your server IP
- (Optional) Stripe, Resend, Anthropic API keys

## Quick Start

### 1. Clone and configure

```bash
git clone https://github.com/dTaxLab/dtax-private.git dtax
cd dtax
cp .env.production.example .env
```
````

Edit `.env` — at minimum set these:

```bash
POSTGRES_PASSWORD=your_secure_db_password
DATABASE_URL=postgresql://dtax:your_secure_db_password@postgres:5432/dtax?schema=public
JWT_SECRET=$(openssl rand -base64 32)
ENCRYPTION_KEY=$(openssl rand -base64 32)
CORS_ORIGIN=https://your-domain.com
APP_URL=https://your-domain.com
NEXT_PUBLIC_API_URL=https://your-domain.com/api
```

### 2. Start services

```bash
docker compose up -d
```

This starts:

- **PostgreSQL** — database on internal network
- **Redis** — cache on internal network
- **Migrate** — runs Prisma migrations (one-time, exits after)
- **API** — Fastify backend on port 3001 (internal)
- **Web** — Next.js frontend on port 3000 (internal)
- **nginx** — reverse proxy on ports 80/443

### 3. Verify deployment

```bash
# Check all services are running
docker compose ps

# Check API health
curl http://localhost/api/health

# Check deep health (DB connectivity)
curl http://localhost/api/health/deep
```

### 4. Enable TLS (recommended)

Install certbot and obtain certificate:

```bash
# Install certbot
docker run --rm -v certbot-data:/var/www/certbot \
  -v letsencrypt:/etc/letsencrypt \
  certbot/certbot certonly --webroot \
  --webroot-path=/var/www/certbot \
  -d your-domain.com --agree-tos -m your@email.com
```

Then edit `docker/nginx/nginx.conf`:

- Uncomment the HTTPS server block
- Uncomment the HTTP → HTTPS redirect
- Replace `your-domain.com` with your actual domain

Restart nginx:

```bash
docker compose restart nginx
```

### 5. Create first admin user

```bash
# Register via API
curl -X POST http://localhost/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@your-domain.com","password":"YourSecurePassword123"}'

# Promote to admin (via database)
docker compose exec postgres psql -U dtax -c \
  "UPDATE users SET role='ADMIN' WHERE email='admin@your-domain.com';"
```

## Architecture

```
Internet → nginx:80/443
              ├→ /api/* → API:3001 → PostgreSQL
              └→ /*     → Web:3000
```

## Updating

```bash
git pull origin main
docker compose build
docker compose up -d
```

The `migrate` service automatically applies new database migrations.

## Backup

```bash
# Database backup
docker compose exec postgres pg_dump -U dtax dtax > backup-$(date +%F).sql

# Restore
docker compose exec -T postgres psql -U dtax dtax < backup-2026-03-13.sql
```

## Optional Services

| Feature     | Env Var                   | Effect when missing                  |
| ----------- | ------------------------- | ------------------------------------ |
| Email       | `RESEND_API_KEY`          | Verification links logged to console |
| Payments    | `STRIPE_SECRET_KEY`       | All users FREE plan (unlimited)      |
| AI Chat     | `ANTHROPIC_API_KEY`       | AI features disabled                 |
| Wallet Sync | `ETHERSCAN_API_KEY`       | Manual CSV import only               |
| Analytics   | `NEXT_PUBLIC_POSTHOG_KEY` | No tracking                          |

## Troubleshooting

**API won't start:**

```bash
docker compose logs api
```

Check for "FATAL: Missing required env vars" — ensure all required vars are set.

**Database connection failed:**

```bash
docker compose logs postgres
docker compose exec postgres pg_isready -U dtax
```

**Migration failed:**

```bash
docker compose logs migrate
# Force re-run
docker compose run --rm migrate
```

**Port 80/443 already in use:**
Edit `docker-compose.yml` nginx ports or stop existing web server.

````

**Step 2: Commit**

```bash
git add docs/self-hosting.md
git commit -m "docs: add comprehensive self-hosting deployment guide"
````

---

### Task 6: Add Database Backup Script

**Files:**

- Create: `docker/scripts/backup.sh`

**Step 1: Create backup script**

```bash
#!/bin/bash
# DTax database backup script
# Usage: ./docker/scripts/backup.sh [backup_dir]
# Cron: 0 2 * * * /path/to/dtax/docker/scripts/backup.sh

set -euo pipefail

BACKUP_DIR="${1:-./backups}"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="${BACKUP_DIR}/dtax_${TIMESTAMP}.sql.gz"
RETAIN_DAYS=30

mkdir -p "$BACKUP_DIR"

echo "[$(date)] Starting backup..."
docker compose exec -T postgres pg_dump -U dtax --clean --if-exists dtax | gzip > "$BACKUP_FILE"

SIZE=$(du -h "$BACKUP_FILE" | cut -f1)
echo "[$(date)] Backup complete: $BACKUP_FILE ($SIZE)"

# Remove backups older than RETAIN_DAYS
find "$BACKUP_DIR" -name "dtax_*.sql.gz" -mtime +${RETAIN_DAYS} -delete
echo "[$(date)] Cleaned backups older than ${RETAIN_DAYS} days"
```

**Step 2: Make executable**

Run: `chmod +x docker/scripts/backup.sh`

**Step 3: Commit**

```bash
git add docker/scripts/backup.sh
git commit -m "feat(infra): add database backup script with retention"
```

---

### Task 7: Five-Step Audit

**Step 1: tsc**
Run: `pnpm --filter @dtax/api exec tsc --noEmit`
Expected: Zero errors

**Step 2: Tests**
Run: `pnpm test`
Expected: 1113+ tests pass

**Step 3: Security**

- Verify `.env.production.example` has no real secrets (all placeholder values)
- Verify `backup.sh` uses `set -euo pipefail`
- Verify nginx config has security headers

Run: `grep -r "CHANGE_ME\|xxxx" .env.production.example | wc -l`
Expected: Multiple lines (all placeholder)

**Step 4: i18n**
N/A for this plan (no UI changes)

**Step 5: Build**
Run: `pnpm build`
Expected: 5/5 success

**Step 6: Docker build test**

Run: `docker compose build api web`
Expected: Both images build successfully

```bash
git commit --allow-empty -m "audit: production deploy plan complete — env validation, nginx TLS, GHCR CI, self-hosting guide"
```
