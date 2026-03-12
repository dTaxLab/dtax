# Phase J: E2E Playwright 测试

**Goal:** 建立端到端测试基础设施，覆盖关键用户流程

**Architecture:** Playwright + 测试 fixtures（mock API 或 MSW），不依赖真实后端

---

## Task J1: Playwright 基础设施

**Files:**

- Create: `apps/web/playwright.config.ts`
- Create: `apps/web/e2e/fixtures.ts` — 共享 fixtures (auth helper, API mock)
- Modify: `apps/web/package.json` — 添加 @playwright/test 依赖 + test:e2e script

**配置要点:**

- baseURL: `http://localhost:3000`
- webServer: 启动 `pnpm dev` (端口 3000)
- 项目: chromium only (精简 CI 时间)
- retries: 0 (本地), 2 (CI)
- reporter: html
- testDir: `./e2e`

**Auth Fixture:**

- 直接在 localStorage 注入 JWT token (跳过登录 UI)
- 复用 `dtax_token` key

## Task J2: 核心用户流程测试 (5 tests)

**Files:**

- Create: `apps/web/e2e/auth.spec.ts` — 登录/注册流程
- Create: `apps/web/e2e/navigation.spec.ts` — 导航 + 公开页面
- Create: `apps/web/e2e/transactions.spec.ts` — 交易列表 + 导入
- Create: `apps/web/e2e/tax-report.spec.ts` — 税务报告 + 导出
- Create: `apps/web/e2e/landing.spec.ts` — Landing page + 定价页

**测试场景:**

### auth.spec.ts

1. 登录页面渲染 (email + password 输入框)
2. 注册切换显示 name 字段
3. 登录失败显示错误
4. 登录成功跳转到 Dashboard

### navigation.spec.ts

5. 公开页面无需登录可访问 (/pricing, /features, /exchanges)
6. 受保护页面未登录重定向到 /auth
7. 已登录用户 Nav 显示所有链接
8. 语言切换 EN↔ZH

### transactions.spec.ts

9. 交易列表页面渲染
10. 导入面板显示格式选项 (含 Koinly/CoinTracker/Cryptact)

### tax-report.spec.ts

11. 税务报告页面渲染
12. 下载按钮存在 (CSV, PDF, TXF)

### landing.spec.ts

13. Landing page Hero 区域渲染
14. 定价卡片显示 Free/Pro/CPA
15. 交易所墙显示支持的格式
