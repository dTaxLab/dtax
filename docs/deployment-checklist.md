# dTax 生产部署检查清单

> 每次部署前逐项确认。标记 ⚠️ 的项目忽略可能导致数据泄露或安全事故。

---

## 一、环境变量

### 必填（缺少任一项服务将拒绝启动）

| 变量             | 要求                                    | 生成命令                  |
| ---------------- | --------------------------------------- | ------------------------- |
| `ENCRYPTION_KEY` | ⚠️ 64 字符十六进制字符串（32 原始字节） | `openssl rand -hex 32`    |
| `JWT_SECRET`     | ≥ 32 字符随机字符串                     | `openssl rand -base64 32` |
| `DATABASE_URL`   | PostgreSQL 连接串                       | —                         |
| `RESEND_API_KEY` | Resend 邮件服务                         | Resend 控制台             |

### 需要轮换的 API 密钥

以下密钥曾出现在 git 历史中，**首次部署前必须重新生成**：

- `RESEND_API_KEY` — Resend 控制台重新生成
- `ETHERSCAN_API_KEY` — etherscan.io 重新生成
- `SOLSCAN_API_KEY` — solscan.io 重新生成
- `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` — Google Cloud Console 重置
- `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET` — GitHub OAuth App 重置
- `POLYGON_API_KEY` — polygonscan.com 重新生成

---

## 二、数据库迁移

### 标准流程

```bash
pnpm --filter @dtax/api prisma migrate deploy
```

### ⚠️ ENCRYPTION_KEY 相关注意事项

**首次部署（无存量数据）**：直接运行 migrate deploy 即可。

**从旧版本升级（存量加密数据）**：

旧版本使用 `AES-256-CBC`（格式 `enc:iv:ciphertext`），当前版本使用 `AES-256-GCM`（格式 `gcm:iv:tag:ciphertext`）。`decryptKey` 会自动识别旧格式并兼容解密，无需重新加密存量数据。

但如果需要彻底迁移存量 TOTP secret 到 GCM，执行以下脚本（需要在 API 服务器上运行，需要 ENCRYPTION_KEY 环境变量）：

```typescript
// scripts/migrate-totp-to-gcm.ts
// pnpm ts-node scripts/migrate-totp-to-gcm.ts
import { prisma } from "./src/lib/prisma";
import { decryptKey, encryptKey, ENCRYPTED_PREFIX } from "./src/lib/encryption";

const users = await prisma.user.findMany({
  where: { totpSecret: { startsWith: "enc:" } },
  select: { id: true, totpSecret: true },
});
for (const u of users) {
  const plain = decryptKey(u.totpSecret!);
  await prisma.user.update({
    where: { id: u.id },
    data: { totpSecret: encryptKey(plain) }, // re-encrypts with GCM
  });
}
console.log(`Migrated ${users.length} TOTP secrets to AES-256-GCM`);
```

### ⚠️ passwordHash 迁移说明

`password_hash` 列已改为可空（`String?`）。迁移文件会自动将 `NULL` 设为默认值，并将历史空字符串记录更新为 `NULL`（OAuth-only 账号）。

```sql
-- 迁移文件中已包含此语句，无需手动执行
UPDATE "User" SET password_hash = NULL WHERE password_hash = '';
```

---

## 三、Cookie 安全

生产环境 session cookie 配置：

| 属性       | 值                            | 说明            |
| ---------- | ----------------------------- | --------------- |
| `httpOnly` | `true`                        | JS 无法读取     |
| `secure`   | `true`（非 development 环境） | 仅 HTTPS 传输   |
| `sameSite` | `lax`                         | CSRF 防护       |
| `maxAge`   | 7 天                          | 与 JWT 过期一致 |

⚠️ 若部署在非标准端口或子域名下，确认 `CORS_ORIGIN` 与前端域名完全匹配（不能使用通配符）。

---

## 四、已知技术债务（已记录，非阻断性）

以下问题已知晓，不影响首次部署，但应在 v1.0 稳定版前解决：

| 编号 | 严重度 | 描述                                             | 影响场景                |
| ---- | ------ | ------------------------------------------------ | ----------------------- |
| TD-1 | Med    | 2FA 速率限制基于内存（单进程），多副本部署会重置 | 水平扩展时需接入 Redis  |
| TD-2 | Low    | TOTP 速率限制计数器进程重启后清零                | 同上                    |
| TD-3 | Low    | recovery code 的 bcrypt cost 10 在高并发下略慢   | 每次验证 ~10×100ms 并行 |

---

## 五、Docker / nginx 部署

### 启动顺序

```bash
# 1. 启动数据库
docker compose up -d postgres

# 2. 运行迁移
docker compose run --rm migrate

# 3. 启动 API
docker compose up -d api

# 4. 启动 Web（Next.js）
# 或使用 Vercel / Cloudflare Pages 部署
```

### nginx 要点

- 确认 `ssl-params.conf` 中 `add_header Strict-Transport-Security` 包含 `preload`
- 确认 `ssl-params.conf` 中 `Content-Security-Policy` 已配置，包含你实际使用的 CDN/分析服务域名
- HTTP (80) → HTTPS (443) 强制跳转已在 `nginx.conf` 配置
- API 反向代理路径：`/api/ → localhost:3001`

---

## 六、部署后验证

```bash
# 健康检查
curl https://api.getdtax.com/api/health

# 确认 cookie 属性正确（在浏览器 DevTools > Application > Cookies 验证）
# dtax_session: HttpOnly ✓, Secure ✓, SameSite: Lax ✓

# 确认 HSTS 响应头
curl -I https://api.getdtax.com/api/health | grep Strict-Transport
```

---

## 七、监控与告警

- Sentry: 确认 `SENTRY_DSN` 已配置，`beforeSend` 过滤 Authorization header（已实装）
- PostHog: 生产环境不传 email/name PII（已实装）
- 服务器访问日志: 确认 nginx 访问日志不记录 Cookie 值

---

_最后更新：2026-03-19_
