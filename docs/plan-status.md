# DTax 计划实施状态总览

> 最后更新: 2026-03-16
> 通过 Serena 代码语义分析 + Claude Code 人工核查验证

---

## 状态说明

| 图标 | 含义                                          |
| ---- | --------------------------------------------- |
| ✅   | 已完成 — 代码中已验证存在完整实现             |
| ⚠️   | 部分完成 — 核心代码存在但计划中部分功能未实现 |
| ❌   | 未实施 — 代码中未找到对应实现                 |

---

## 一、已完成的计划 (22 个)

| #   | 计划文件                          | 内容                            | 验证依据                                                                                     |
| --- | --------------------------------- | ------------------------------- | -------------------------------------------------------------------------------------------- |
| 3   | `03-2fa-totp.md`                  | 两步验证 TOTP                   | `routes/two-factor.ts` + `lib/totp.ts` + `otpauth` 库 + 完整单元测试                         |
| 4   | `04-gdpr-data-export-delete.md`   | GDPR 数据导出与账户删除         | `lib/account-deletion.ts` + `lib/data-export.ts` + `routes/account.ts` + 测试                |
| 5   | `05-e2e-test-expansion.md`        | E2E 测试扩展 (v1)               | 从 3 个 spec 扩展到 19 个，覆盖所有关键页面                                                  |
| 7   | `07-audit-log.md`                 | 审计日志系统                    | `lib/audit.ts` + `routes/audit.ts` + AuditLog Prisma 模型 + 测试                             |
| 11  | `11-analytics-tracking.md`        | PostHog 分析埋点                | `lib/analytics.ts` 含 posthog init/capture/identify/reset                                    |
| 13  | `13-api-caching.md`               | API 响应缓存                    | `lib/cache.ts` MemoryCache(120s TTL, 5000 max) + 多路由集成 invalidate                       |
| 15  | `15-design-tokens.md`             | Design Tokens + 内联样式消除    | `globals.css` 新增 spacing/typography/component tokens + ~70 utility classes                 |
| 22  | `22-e2e-test-expansion.md`        | E2E 测试扩展 (v2)               | 同 Plan 5 成果，19 specs 完整覆盖                                                            |
| 23  | `23-inline-styles-cleanup.md`     | 内联样式清理                    | ~634 个内联样式减少至 ~200，静态值全部转为 CSS classes                                       |
| 24  | `24-component-library.md`         | 组件库提取                      | `components/ui/` 下 9 个可复用组件 + Lucide 图标替换                                         |
| 25  | `25-landing-page-glass-aurora.md` | Landing Page Glass Aurora       | aurora CSS 动画 + glass-card 样式 + IntersectionObserver 滚动渐入                            |
| —   | `plan-tier-enforcement.md`        | PRO/CPA 功能门控                | `checkFeatureAccess()` 在 `plan-guard.ts` + `tax.ts` 7 处调用 + 完整测试                     |
| —   | `seo-geo-content-marketing.md`    | SEO/GEO 内容营销                | `json-ld.tsx` (Organization+BreadcrumbList+FAQ) + MDX 博客 34篇×7语言 + sitemap.ts           |
| —   | `2026-03-16-audit-fixes.md`       | 安全审计修复 (14 tasks)         | 路径穿越 + JWT 守卫 + token 泄露 + 持有期修复 + DRY + wash sale + 全部已实施                 |
| —   | `2026-03-16-auth-dashboard.md`    | Auth & Dashboard 优化 (8 tasks) | labels/a11y + 密码强度 + 内联验证 + CSS 迁移 + 拖放上传 + 暗色对比度 + Modal + Get Started   |
| —   | `06-notification-system.md`       | 应用内通知系统                  | Notification Prisma 模型 + `routes/notifications.ts` + bell UI + 30s 轮询 + 可见性检查       |
| —   | `09-report-history.md`            | 报告历史与下载管理              | TaxReport 模型 + `report-storage.ts` + download API (fetch+Blob) + 路径遍历保护              |
| —   | `17-production-deploy.md`         | 生产部署基础设施                | Dockerfile (api+web) + nginx.conf + docker-compose + GHCR CI/CD + env 验证                   |
| —   | `16-npm-publish.md`               | npm 发布配置                    | exports 字段修复 + changeset + publish.yml（待配置 NPM_TOKEN secret）                        |
| —   | `08-defi-wallet-connect.md`       | DeFi 钱包连接                   | `routes/wallets.ts` + etherscan-indexer + solscan-indexer + 地址验证（⚠️ sync 未调用索引器） |
| —   | `12-i18n-hardcode-fix.md`         | i18n 硬编码修复                 | nav.tsx 3 处 aria-label 已国际化 (2026-03-16 修复)                                           |
| —   | `14-cli-test-expansion.md`        | CLI 测试覆盖扩展                | 54 个 CLI 测试 (lib.test.ts + cli-integration.test.ts)                                       |

---

## 二、部分完成的计划 (2 个)

| #   | 计划文件                    | 内容               | 已完成                                                                                                 | 未完成                                                                                          |
| --- | --------------------------- | ------------------ | ------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------- |
| 1   | `01-cpa-multi-client.md`    | CPA 多客户管理系统 | Client Prisma 模型 + `routes/clients.ts` (CRUD + invite/accept + batch-report) + `cpa-guard.ts` + 测试 | Dashboard 客户切换器 UI、所有路由的 `clientId` query param 代理访问、邀请邮件发送 (Resend 集成) |
| —   | `08-defi-wallet-connect.md` | DeFi 钱包同步      | 钱包连接 + 索引器代码 + 地址验证 + UI                                                                  | **`/wallets/:id/sync` 未调用索引器**，仅更新时间戳，交易不会写入数据库                          |

---

## 三、未实施的计划 (2 个)

| 计划文件                                 | 内容           | 任务数 | 说明                                                                                  |
| ---------------------------------------- | -------------- | ------ | ------------------------------------------------------------------------------------- |
| `2026-03-12-10-large-file-refactor.md`   | 大文件拆分重构 | 8      | form8949-pdf.ts (451行) 等超 350 行文件拆分                                           |
| `2026-03-15-ai-operations-automation.md` | AI 自动化运营  | ~12    | n8n 自建 + X/Twitter 自动发帖 + 博客自动生成 + YouTube Shorts + Google Ads (~$401/月) |

---

## 四、建议执行顺序

```
Phase 1 (紧急): 钱包同步功能实现
  └─ /wallets/:id/sync 调用 etherscan/solscan 索引器，交易写入数据库

Phase 2 (上线): npm 实际发布 (配置 NPM_TOKEN) → 生产环境部署 (域名+TLS)

Phase 3 (质量): large-file-refactor (form8949-pdf.ts 拆分)

Phase 4 (运营): ai-operations-automation (n8n 基础设施, 非代码)
```

---

## 五、已合并但未列入计划的改进

以下功能在日常开发中已实现，不属于任何计划文件:

- 1099-DA covered/noncovered 分类 (3阶段匹配策略)
- 交易所连接 CCXT 集成 (`routes/connections.ts`)
- AI 交易分类 (`lib/ai-classify.ts`)
- Chat SSE 流式响应 (`routes/chat.ts`)
- Portfolio 持仓分析 + TLH 机会识别 (`routes/portfolio.ts`)
- Auth form UX 优化 (labels + 密码强度 + 内联验证 + loading spinner)
- Dashboard 空状态 Get Started 卡片美化
- 暗色模式 WCAG AA 对比度修复
- Settings 页面 confirm() → Modal 组件
- CSV Import 拖放上传区

---

## 六、待处理的外部依赖

### Dependabot PR (未合并)

| PR 分支                                     | 升级内容              |
| ------------------------------------------- | --------------------- |
| `dependabot/npm_and_yarn/production-deps-*` | 7 个生产依赖升级      |
| `dependabot/npm_and_yarn/prisma-7.5.0`      | Prisma 6.19.2 → 7.5.0 |

### CI/CD Workflow

| 文件                            | 状态                                                        |
| ------------------------------- | ----------------------------------------------------------- |
| `.github/workflows/ci.yml`      | ✅ 运行中 (Node 20+22 矩阵, 已修复 shared-types build 顺序) |
| `.github/workflows/publish.yml` | ✅ 存在 (changesets/action) 但未触发过正式发布              |
| `.github/workflows/docker.yml`  | ✅ GHCR 镜像构建 (已修复 tsconfig.base.json 缺失)           |
