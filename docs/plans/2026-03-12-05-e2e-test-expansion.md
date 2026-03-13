# E2E 测试扩展 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 将 E2E 测试从 3 个 spec（12 用例）扩展到 13+ 个 spec，覆盖所有关键用户旅程，确保上线前质量。

**Architecture:** 使用 Playwright 编写 E2E 测试。每个 spec 文件对应一个用户旅程。使用 Page Object 模式减少代码重复。通过 API 直接创建测试数据（避免 UI 依赖）。

**Tech Stack:** Playwright 1.58, TypeScript, Fastify inject (seed data)

---

### Task 1: 测试基础设施 — Page Objects & Fixtures

**Files:**

- Create: `apps/web/e2e/fixtures/auth.ts`
- Create: `apps/web/e2e/fixtures/api-helpers.ts`
- Create: `apps/web/e2e/page-objects/nav.po.ts`

**Step 1: 创建认证 fixture**

```typescript
// apps/web/e2e/fixtures/auth.ts
import { test as base, expect } from "@playwright/test";

type AuthFixture = {
  authenticatedPage: import("@playwright/test").Page;
};

export const test = base.extend<AuthFixture>({
  authenticatedPage: async ({ page }, use) => {
    // 通过 API 登录获取 token
    const res = await page.request.post(
      "http://localhost:3001/api/v1/auth/login",
      {
        data: { email: "dev@getdtax.com", password: "devpassword123" },
      },
    );
    const { data } = await res.json();
    // 注入 token 到 localStorage
    await page.goto("/");
    await page.evaluate((token) => {
      localStorage.setItem("dtax_token", token);
    }, data.token);
    await page.reload();
    await use(page);
  },
});

export { expect };
```

**Step 2: 创建 API helpers**

```typescript
// apps/web/e2e/fixtures/api-helpers.ts
const API = "http://localhost:3001/api/v1";

export async function seedTransactions(token: string, count: number) {
  // 通过 API 批量创建测试交易
}

export async function cleanupTestData(token: string) {
  // 清理测试数据
}
```

**Step 3: 创建 Navigation Page Object**

```typescript
// apps/web/e2e/page-objects/nav.po.ts
import { Page, Locator } from "@playwright/test";

export class NavPO {
  readonly page: Page;
  readonly dashboardLink: Locator;
  readonly transactionsLink: Locator;
  readonly taxLink: Locator;
  readonly portfolioLink: Locator;
  readonly settingsLink: Locator;

  constructor(page: Page) {
    this.page = page;
    this.dashboardLink = page.getByRole("link", { name: /dashboard/i });
    this.transactionsLink = page.getByRole("link", { name: /transactions/i });
    this.taxLink = page.getByRole("link", { name: /tax/i });
    this.portfolioLink = page.getByRole("link", { name: /portfolio/i });
    this.settingsLink = page.getByRole("link", { name: /settings/i });
  }

  async navigateTo(link: Locator) {
    await link.click();
    await this.page.waitForLoadState("networkidle");
  }
}
```

**Step 4: Commit**

```bash
git add apps/web/e2e/fixtures/ apps/web/e2e/page-objects/
git commit -m "test(e2e): add auth fixtures, API helpers, and page objects"
```

---

### Task 2: CSV 导入流程 E2E

**Files:**

- Create: `apps/web/e2e/csv-import.spec.ts`
- Create: `apps/web/e2e/test-data/sample-coinbase.csv`

**Step 1: 创建测试 CSV 文件**

```csv
Timestamp,Transaction Type,Asset,Quantity Transacted,Spot Price Currency,Spot Price at Transaction,Subtotal,Total (inclusive of fees and/or spread),Fees and/or Spread,Notes
2024-01-15T10:00:00Z,Buy,BTC,0.5,USD,42000.00,21000.00,21050.00,50.00,
2024-06-20T14:30:00Z,Sell,BTC,0.25,USD,65000.00,16250.00,16200.00,50.00,
```

**Step 2: 编写导入测试**

```typescript
import { test, expect } from "../fixtures/auth";
import path from "path";

test.describe("CSV Import Flow", () => {
  test("should import Coinbase CSV and show transactions", async ({
    authenticatedPage: page,
  }) => {
    await page.goto("/en/transactions");

    // 点击导入按钮
    await page.getByRole("button", { name: /import/i }).click();

    // 上传 CSV 文件
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles(
      path.join(__dirname, "test-data/sample-coinbase.csv"),
    );

    // 等待导入完成
    await expect(page.getByText(/imported/i)).toBeVisible({ timeout: 10000 });

    // 验证交易显示
    await expect(page.getByText("BTC")).toBeVisible();
    await expect(page.getByText("0.5")).toBeVisible();
  });

  test("should detect CSV format automatically", async ({
    authenticatedPage: page,
  }) => {
    // ...
  });

  test("should handle duplicate detection", async ({
    authenticatedPage: page,
  }) => {
    // Import same file twice, expect dedup warning
  });
});
```

**Step 3: Commit**

```bash
git add apps/web/e2e/csv-import.spec.ts apps/web/e2e/test-data/
git commit -m "test(e2e): add CSV import flow E2E tests"
```

---

### Task 3: 税务计算流程 E2E

**Files:**

- Create: `apps/web/e2e/tax-calculation.spec.ts`

**Step 1: 编写税务计算测试**

```typescript
test.describe("Tax Calculation Flow", () => {
  test("should calculate taxes with FIFO method", async ({
    authenticatedPage: page,
  }) => {
    await page.goto("/en/tax");
    // 选择年份和方法
    await page.selectOption('[data-testid="tax-year"]', "2024");
    await page.selectOption('[data-testid="tax-method"]', "FIFO");
    // 点击计算
    await page.getByRole("button", { name: /calculate/i }).click();
    // 等待结果
    await expect(page.getByText(/short-term/i)).toBeVisible({ timeout: 15000 });
    await expect(page.getByText(/long-term/i)).toBeVisible();
  });

  test("should generate Form 8949 CSV", async ({ authenticatedPage: page }) => {
    // Navigate to tax page, trigger download
    // Verify download started
  });

  test("should generate Form 8949 PDF", async ({ authenticatedPage: page }) => {
    // Similar but for PDF
  });

  test("should show method comparison", async ({ authenticatedPage: page }) => {
    // Navigate, compare FIFO vs LIFO vs HIFO
  });
});
```

**Step 2: Commit**

```bash
git add apps/web/e2e/tax-calculation.spec.ts
git commit -m "test(e2e): add tax calculation flow E2E tests"
```

---

### Task 4: Settings & Billing E2E

**Files:**

- Create: `apps/web/e2e/settings.spec.ts`

**Step 1: 编写测试**

```typescript
test.describe("Settings Page", () => {
  test("should display user info", async ({ authenticatedPage: page }) => {
    await page.goto("/en/settings");
    await expect(page.getByText("dev@getdtax.com")).toBeVisible();
  });

  test("should change default cost basis method", async ({
    authenticatedPage: page,
  }) => {
    await page.goto("/en/settings");
    await page.selectOption('[data-testid="default-method"]', "LIFO");
    await page.getByRole("button", { name: /save/i }).click();
    await expect(page.getByText(/saved/i)).toBeVisible();
  });

  test("should change fiat currency", async ({ authenticatedPage: page }) => {
    // Change to EUR, verify formatting changes
  });

  test("should list data sources", async ({ authenticatedPage: page }) => {
    // Verify imported sources appear
  });

  test("should rename data source", async ({ authenticatedPage: page }) => {
    // Click rename, enter new name, save
  });
});
```

**Step 2: Commit**

```bash
git add apps/web/e2e/settings.spec.ts
git commit -m "test(e2e): add settings page E2E tests"
```

---

### Task 5: Onboarding Wizard E2E

**Files:**

- Create: `apps/web/e2e/onboarding.spec.ts`

**Step 1: 编写测试**

```typescript
test.describe("Onboarding Wizard", () => {
  test("should complete 4-step onboarding flow", async ({ page }) => {
    // Register new user
    // Should redirect to onboarding
    // Step 1: Select role
    // Step 2: Select exchanges
    // Step 3: Choose import method
    // Step 4: Completion
    // Should redirect to dashboard
  });

  test("should allow skipping onboarding", async ({ page }) => {
    // Click skip at any step → goes to dashboard
  });
});
```

**Step 2: Commit**

```bash
git add apps/web/e2e/onboarding.spec.ts
git commit -m "test(e2e): add onboarding wizard E2E tests"
```

---

### Task 6: AI Assistant E2E

**Files:**

- Create: `apps/web/e2e/ai-assistant.spec.ts`

**Step 1: 编写测试（graceful degradation when API key missing）**

```typescript
test.describe("AI Assistant", () => {
  test("should display chat interface", async ({ authenticatedPage: page }) => {
    await page.goto("/en/ai-assistant");
    await expect(page.getByPlaceholder(/message/i)).toBeVisible();
  });

  test("should create a new conversation", async ({
    authenticatedPage: page,
  }) => {
    await page.goto("/en/ai-assistant");
    // Type message
    await page.getByPlaceholder(/message/i).fill("What are my total gains?");
    await page.getByRole("button", { name: /send/i }).click();
    // Should show user message
    await expect(page.getByText("What are my total gains?")).toBeVisible();
    // Should show loading or response (depending on API key availability)
  });

  test("should show upgrade modal for free users at limit", async ({
    authenticatedPage: page,
  }) => {
    // Test quota enforcement
  });
});
```

**Step 2: Commit**

```bash
git add apps/web/e2e/ai-assistant.spec.ts
git commit -m "test(e2e): add AI assistant E2E tests"
```

---

### Task 7: Portfolio & Transfer Matching E2E

**Files:**

- Create: `apps/web/e2e/portfolio.spec.ts`
- Create: `apps/web/e2e/transfers.spec.ts`

**Step 1: Portfolio 测试**

```typescript
test.describe("Portfolio Page", () => {
  test("should display holdings table", async ({ authenticatedPage: page }) => {
    await page.goto("/en/portfolio");
    // Verify table headers: Asset, Amount, Value, Cost Basis, Unrealized P&L
  });

  test("should show tax-loss harvesting opportunities", async ({
    authenticatedPage: page,
  }) => {
    // If losses exist, TLH section should appear
  });
});
```

**Step 2: Transfer Matching 测试**

```typescript
test.describe("Transfer Matching", () => {
  test("should display pending matches", async ({
    authenticatedPage: page,
  }) => {
    await page.goto("/en/transfers");
    // Verify match cards or empty state
  });

  test("should confirm a transfer match", async ({
    authenticatedPage: page,
  }) => {
    // Click confirm on a match pair
  });
});
```

**Step 3: Commit**

```bash
git add apps/web/e2e/portfolio.spec.ts apps/web/e2e/transfers.spec.ts
git commit -m "test(e2e): add portfolio and transfer matching E2E tests"
```

---

### Task 8: Simulator & Compare E2E

**Files:**

- Create: `apps/web/e2e/simulator.spec.ts`
- Create: `apps/web/e2e/compare.spec.ts`

**Step 1: Simulator 测试**

```typescript
test.describe("Tax Impact Simulator", () => {
  test("should simulate a hypothetical sale", async ({
    authenticatedPage: page,
  }) => {
    await page.goto("/en/simulator");
    // Select asset, enter amount, see projected gain/loss
  });
});
```

**Step 2: Compare 测试**

```typescript
test.describe("Year-over-Year Compare", () => {
  test("should display multi-year comparison", async ({
    authenticatedPage: page,
  }) => {
    await page.goto("/en/compare");
    // Verify comparison table
  });
});
```

**Step 3: Commit**

```bash
git add apps/web/e2e/simulator.spec.ts apps/web/e2e/compare.spec.ts
git commit -m "test(e2e): add simulator and compare page E2E tests"
```

---

### Task 9: 响应式 & 主题测试

**Files:**

- Create: `apps/web/e2e/responsive.spec.ts`

**Step 1: 编写响应式测试**

```typescript
test.describe("Responsive Design", () => {
  test("should show hamburger menu on mobile", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto("/en");
    await expect(
      page.getByRole("button", { name: /toggle menu/i }),
    ).toBeVisible();
  });

  test("should toggle dark/light theme", async ({
    authenticatedPage: page,
  }) => {
    await page.goto("/en/settings");
    // Click theme toggle
    const html = page.locator("html");
    const initialTheme = await html.getAttribute("data-theme");
    await page.getByRole("button", { name: /switch to/i }).click();
    const newTheme = await html.getAttribute("data-theme");
    expect(newTheme).not.toBe(initialTheme);
  });

  test("should switch language", async ({ page }) => {
    await page.goto("/en");
    await page.getByRole("button", { name: /中文/i }).click();
    await expect(page).toHaveURL(/\/zh/);
  });
});
```

**Step 2: Commit**

```bash
git add apps/web/e2e/responsive.spec.ts
git commit -m "test(e2e): add responsive design and theme switching E2E tests"
```

---

### Task 10: 五步法审计

**Step 1: 类型安全** — `cd apps/web && npx tsc --noEmit`

**Step 2: 测试回归** — `pnpm test` (确保单元测试不受影响) + `cd apps/web && npx playwright test`

**Step 3: 安全** — 测试数据不含真实密钥，测试用户为 seed 用户

**Step 4: i18n** — E2E 测试中验证英文和中文切换

**Step 5: 构建** — `pnpm build`

**最终覆盖统计目标:**

- 3 → 13+ spec 文件
- 12 → 50+ 测试用例
- 覆盖: 认证、导入、计算、报告、设置、AI、Portfolio、转账、模拟、对比、Onboarding、响应式、主题
