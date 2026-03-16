# DTax 计划实施状态总览

> 最后更新: 2026-03-16
> 通过 Serena 代码语义分析验证

---

## 状态说明

| 图标 | 含义                                          |
| ---- | --------------------------------------------- |
| ✅   | 已完成 — 代码中已验证存在完整实现             |
| ⚠️   | 部分完成 — 核心代码存在但计划中部分功能未实现 |
| ❌   | 未实施 — 代码中未找到对应实现                 |

---

## 一、已完成的计划 (13 个)

| #   | 计划文件                          | 内容                         | 验证依据                                                                           |
| --- | --------------------------------- | ---------------------------- | ---------------------------------------------------------------------------------- |
| 3   | `03-2fa-totp.md`                  | 两步验证 TOTP                | `routes/two-factor.ts` + `lib/totp.ts` + `otpauth` 库 + 完整单元测试               |
| 4   | `04-gdpr-data-export-delete.md`   | GDPR 数据导出与账户删除      | `lib/account-deletion.ts` + `lib/data-export.ts` + `routes/account.ts` + 测试      |
| 5   | `05-e2e-test-expansion.md`        | E2E 测试扩展 (v1)            | 从 3 个 spec 扩展到 19 个，覆盖所有关键页面                                        |
| 7   | `07-audit-log.md`                 | 审计日志系统                 | `lib/audit.ts` + `routes/audit.ts` + AuditLog Prisma 模型 + 测试                   |
| 11  | `11-analytics-tracking.md`        | PostHog 分析埋点             | `lib/analytics.ts` 含 posthog init/capture/identify/reset                          |
| 13  | `13-api-caching.md`               | API 响应缓存                 | `lib/cache.ts` MemoryCache(120s TTL, 5000 max) + 多路由集成 invalidate             |
| 15  | `15-design-tokens.md`             | Design Tokens + 内联样式消除 | `globals.css` 新增 spacing/typography/component tokens + ~70 utility classes       |
| 22  | `22-e2e-test-expansion.md`        | E2E 测试扩展 (v2)            | 同 Plan 5 成果，19 specs 完整覆盖                                                  |
| 23  | `23-inline-styles-cleanup.md`     | 内联样式清理                 | ~634 个内联样式减少至 ~200，静态值全部转为 CSS classes                             |
| 24  | `24-component-library.md`         | 组件库提取                   | `components/ui/` 下 9 个可复用组件 + Lucide 图标替换                               |
| 25  | `25-landing-page-glass-aurora.md` | Landing Page Glass Aurora    | aurora CSS 动画 + glass-card 样式 + IntersectionObserver 滚动渐入                  |
| —   | `plan-tier-enforcement.md`        | PRO/CPA 功能门控             | `checkFeatureAccess()` 在 `plan-guard.ts` + `tax.ts` 7 处调用 + 完整测试           |
| —   | `seo-geo-content-marketing.md`    | SEO/GEO 内容营销             | `json-ld.tsx` (Organization+BreadcrumbList+FAQ) + MDX 博客 34篇×7语言 + sitemap.ts |

---

## 二、部分完成的计划 (1 个)

| #   | 计划文件                 | 内容               | 已完成                                                                                                 | 未完成                                                                                          |
| --- | ------------------------ | ------------------ | ------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------- |
| 1   | `01-cpa-multi-client.md` | CPA 多客户管理系统 | Client Prisma 模型 + `routes/clients.ts` (CRUD + invite/accept + batch-report) + `cpa-guard.ts` + 测试 | Dashboard 客户切换器 UI、所有路由的 `clientId` query param 代理访问、邀请邮件发送 (Resend 集成) |

---

## 三、未实施的计划 (11 个)

### 🔴 安全审计修复 — 最高优先级

| 计划文件                    | 内容     | 任务数 | 说明                                                                           |
| --------------------------- | -------- | ------ | ------------------------------------------------------------------------------ |
| `2026-03-16-audit-fixes.md` | 审计修复 | **14** | 含 6 个 Critical 安全问题 + 2 个 Critical 正确性问题 + 6 个 Important 质量问题 |

**Critical 安全问题:**

1. Report storage 路径穿越漏洞
2. Auth whitelist 缺少 2FA login 路由
3. JWT/Encryption 生产环境默认值未拦截
4. Auth token 泄漏在 URL 中 (应改为 fetch+Blob)
5. AuthGuard 使用 require() 而非 router redirect
6. Settings 页面静默吞掉所有错误

**Critical 正确性问题:** 7. Holding period 使用毫秒计算而非日历计算 (IRS 规则: 需 "more than 1 year") 8. Wrap-unwrap consumed lot 检查在 mutation 后执行

**Important 质量问题:** 9. Wallet connect 503 UX 体验差 10. DRY: 7 个 method 文件重复 getHoldingPeriod 11. shared-types TxType 未对齐 12. Risk scanner 缺少 backward wash sale 检查 13. Notification polling 未检查页面可见性 14. 残留硬编码 i18n 字符串

---

### P0 — 核心商业价值 & 上线必需

| 计划文件                             | 内容            | 任务数 | 说明                                                    |
| ------------------------------------ | --------------- | ------ | ------------------------------------------------------- |
| `2026-03-13-17-production-deploy.md` | 生产部署        | ~8     | 环境变量验证 + nginx TLS + Docker CI/CD + 自托管指南    |
| `2026-03-13-16-npm-publish.md`       | npm 首次发布    | ~6     | 修复 exports 字段 + changeset + dry-run + 发布 @dtax/\* |
| `2026-03-12-02-npm-publish.md`       | npm 发布 (旧版) | 6      | 被 Plan 16 替代，仅作参考                               |

---

### P2 — 功能增强 & 竞争力

| 计划文件                               | 内容               | 任务数 | 说明                                                     |
| -------------------------------------- | ------------------ | ------ | -------------------------------------------------------- |
| `2026-03-12-06-notification-system.md` | 应用内通知系统     | 9      | Notification Prisma 模型 + API CRUD + 铃铛 UI + 轮询 30s |
| `2026-03-12-09-report-history.md`      | 报告历史与下载管理 | 6      | 扩展 TaxReport + 文件存储 + 下载 API + UI                |
| `2026-03-12-10-large-file-refactor.md` | 大文件拆分重构     | 8      | form8949-pdf.ts (11701行→4文件) 等超 350 行文件拆分      |
| `2026-03-12-08-defi-wallet-connect.md` | DeFi 钱包直连      | 11     | Etherscan/Solscan API 按地址拉取链上交易 + 定时同步      |

---

### P3 — 增长 & 优化

| 计划文件                                 | 内容             | 任务数 | 说明                                                                                  |
| ---------------------------------------- | ---------------- | ------ | ------------------------------------------------------------------------------------- |
| `2026-03-12-12-i18n-hardcode-fix.md`     | i18n 硬编码修复  | 3      | nav.tsx 2 处 aria-label 硬编码英文                                                    |
| `2026-03-12-14-cli-test-expansion.md`    | CLI 测试覆盖扩展 | 4      | calculate/compare/wash-sale/schedule-d/output/json/currency                           |
| `2026-03-15-ai-operations-automation.md` | AI 自动化运营    | ~12    | n8n 自建 + X/Twitter 自动发帖 + 博客自动生成 + YouTube Shorts + Google Ads (~$401/月) |

---

## 四、建议执行顺序

```
Phase 1 (安全): audit-fixes.md
  ├─ Task 1-6: Critical 安全修复
  ├─ Task 7-9: Critical 正确性 + Bug 修复
  └─ Task 10-14: Important 质量改进

Phase 2 (上线): production-deploy → npm-publish (Plan 16)

Phase 3 (功能): notification-system → report-history → large-file-refactor

Phase 4 (优化): i18n-fix → cli-tests → defi-wallet-connect

Phase 5 (运营): ai-operations-automation (非代码, n8n 基础设施)
```

---

## 五、已合并但未列入计划的改进

以下功能在日常开发中已实现，不属于任何计划文件:

- 1099-DA covered/noncovered 分类 (3阶段匹配策略)
- 交易所连接 CCXT 集成 (`routes/connections.ts`)
- AI 交易分类 (`lib/ai-classify.ts`)
- Chat SSE 流式响应 (`routes/chat.ts`)
- Portfolio 持仓分析 + TLH 机会识别 (`routes/portfolio.ts`)

---

## 六、待处理的外部依赖

### Dependabot PR (未合并)

| PR 分支                                     | 升级内容              |
| ------------------------------------------- | --------------------- |
| `dependabot/npm_and_yarn/production-deps-*` | 7 个生产依赖升级      |
| `dependabot/npm_and_yarn/prisma-7.5.0`      | Prisma 6.19.2 → 7.5.0 |

### CI/CD Workflow

| 文件                            | 状态                                           |
| ------------------------------- | ---------------------------------------------- |
| `.github/workflows/ci.yml`      | ✅ 运行中 (Node 20+22 矩阵)                    |
| `.github/workflows/publish.yml` | ✅ 存在 (changesets/action) 但未触发过正式发布 |
