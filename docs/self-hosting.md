# Self-Hosting DTax

This guide covers deploying DTax on your own server using Docker Compose.

## Prerequisites

- Linux server (Ubuntu 22.04+ recommended) with 2+ GB RAM
- Docker Engine 24+ and Docker Compose v2
- A domain name pointed to your server's IP
- Ports 80 and 443 open in your firewall

## Quick Start

### 1. Clone the repository

```bash
git clone https://github.com/dTaxLab/dtax.git
cd dtax
```

### 2. Configure environment

```bash
cp .env.production.example .env
```

Edit `.env` and set **all required values**:

| Variable            | Description                                                                                                     |
| ------------------- | --------------------------------------------------------------------------------------------------------------- |
| `POSTGRES_PASSWORD` | Strong database password                                                                                        |
| `JWT_SECRET`        | Random string, at least 32 characters                                                                           |
| `ENCRYPTION_KEY`    | **64-character hex string** (32 raw bytes). Use `openssl rand -hex 32` — other formats crash the API on startup |
| `CORS_ORIGIN`       | Your domain, e.g. `https://tax.example.com`                                                                     |
| `APP_URL`           | Public URL of your web app (used in password-reset emails), e.g. `https://tax.example.com`                      |

Generate secure secrets:

```bash
openssl rand -hex 32     # Use output for ENCRYPTION_KEY (must be 64-char hex)
openssl rand -base64 32  # Use output for JWT_SECRET
openssl rand -base64 24  # Use output for POSTGRES_PASSWORD
```

### 3. Start services

```bash
docker compose up -d
```

This starts PostgreSQL, Redis, API, Web, and nginx. The `migrate` service runs database migrations automatically on first start.

Verify everything is running:

```bash
docker compose ps
curl http://localhost/api/health
```

## Architecture

```
                    ┌──────────┐
    :80/:443  ──────│  nginx   │
                    └────┬─────┘
                    ┌────┴─────┐
              ┌─────│  routes  │─────┐
              │     └──────────┘     │
         ┌────┴───┐            ┌─────┴────┐
         │  API   │            │   Web    │
         │ :3001  │            │  :3000   │
         └────┬───┘            └──────────┘
         ┌────┴───┐  ┌───────┐
         │Postgres│  │ Redis │
         └────────┘  └───────┘
```

## TLS Setup with Let's Encrypt

### 1. Update nginx config

Edit `docker/nginx/nginx.conf` and replace `server_name _;` with your domain:

```nginx
server_name tax.example.com;
```

### 2. Obtain certificate

```bash
docker compose up -d nginx

docker run --rm \
  -v dtax_letsencrypt:/etc/letsencrypt \
  -v dtax_certbot-data:/var/www/certbot \
  certbot/certbot certonly \
  --webroot -w /var/www/certbot \
  -d tax.example.com \
  --agree-tos --email you@example.com
```

### 3. Enable HTTPS

Add an HTTPS server block to `docker/nginx/nginx.conf`:

```nginx
server {
    listen 443 ssl http2;
    server_name tax.example.com;

    ssl_certificate /etc/letsencrypt/live/tax.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/tax.example.com/privkey.pem;
    include /etc/nginx/snippets/ssl-params.conf;

    location /api/ {
        proxy_pass http://api/api/;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
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
```

Restart nginx:

```bash
docker compose restart nginx
```

### 4. Auto-renew certificates

Add a cron job:

```bash
echo "0 3 * * * docker run --rm -v dtax_letsencrypt:/etc/letsencrypt -v dtax_certbot-data:/var/www/certbot certbot/certbot renew --quiet && docker compose restart nginx" | crontab -
```

## First Admin User

1. Register at `https://yourdomain.com/register`
2. Promote to admin via the database:

```bash
docker compose exec postgres psql -U dtax -c \
  "UPDATE \"User\" SET role='ADMIN' WHERE email='your@email.com';"
```

## Updates

```bash
git pull
docker compose build
docker compose up -d
```

The `migrate` service runs automatically to apply any new database migrations.

## Backups

Use the included backup script:

```bash
chmod +x docker/scripts/backup.sh
./docker/scripts/backup.sh ./backups
```

Schedule daily backups via cron:

```bash
echo "0 2 * * * /path/to/dtax/docker/scripts/backup.sh /path/to/dtax/backups" | crontab -
```

To restore from backup:

```bash
gunzip -c backups/dtax_20260313_020000.sql.gz | \
  docker compose exec -T postgres psql -U dtax dtax
```

## Optional Services

| Service   | Env Variables                                                                              | Purpose                                                                          |
| --------- | ------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------- |
| Resend    | `RESEND_API_KEY`, `FROM_EMAIL`                                                             | Email verification & password reset (without this, users cannot reset passwords) |
| Stripe    | `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRO_PRICE_ID`, `STRIPE_CPA_PRICE_ID` | Payment processing & subscription billing                                        |
| Anthropic | `ANTHROPIC_API_KEY`                                                                        | AI transaction classification & chat                                             |
| Etherscan | `ETHERSCAN_API_KEY`                                                                        | EVM blockchain indexing (Ethereum, Polygon, BSC, Arbitrum, Optimism)             |
| Solscan   | `SOLSCAN_API_KEY`                                                                          | Solana blockchain indexing                                                       |
| PostHog   | `NEXT_PUBLIC_POSTHOG_KEY`, `NEXT_PUBLIC_POSTHOG_HOST`                                      | Product analytics                                                                |
| Sentry    | `SENTRY_DSN`                                                                               | Error tracking                                                                   |

All optional services degrade gracefully when not configured.

## Troubleshooting

**Services fail to start**

```bash
docker compose logs api    # Check API logs
docker compose logs web    # Check Web logs
docker compose logs nginx  # Check nginx logs
```

**Database connection errors**

Ensure `POSTGRES_PASSWORD` in `.env` matches and the postgres service is healthy:

```bash
docker compose ps postgres
```

**Port conflicts**

If ports 80/443 are in use, edit `docker-compose.yml` to change the nginx port mappings.

**Out of disk space**

```bash
docker system prune -f     # Remove unused images/containers
```

**Reset everything**

```bash
docker compose down -v     # WARNING: Destroys all data including database
docker compose up -d
```
