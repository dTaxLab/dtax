import { test, expect } from "@playwright/test";

test.describe("Landing page", () => {
  test("hero section renders with brand and CTA", async ({ page }) => {
    await page.goto("/en");
    await expect(page.locator("body")).toContainText(/dtax/i);
    const ctaButton = page.getByRole("link", {
      name: /get started|start free|sign up/i,
    });
    await expect(ctaButton.first()).toBeVisible();
  });

  test("pricing section shows Free, Pro, and CPA tiers", async ({ page }) => {
    await page.goto("/en/pricing");
    await expect(page.locator("body")).toContainText(/free/i);
    await expect(page.locator("body")).toContainText(/pro/i);
    await expect(page.locator("body")).toContainText(/cpa/i);
  });

  test("exchanges page lists supported formats", async ({ page }) => {
    await page.goto("/en/exchanges");
    await expect(page.locator("body")).toContainText(/coinbase/i);
    await expect(page.locator("body")).toContainText(/binance/i);
    await expect(page.locator("body")).toContainText(/koinly/i);
  });

  test("features page renders feature sections", async ({ page }) => {
    await page.goto("/en/features");
    await expect(page.locator("body")).toContainText(/form 8949|tax/i);
  });

  test("FAQ page renders accordion questions", async ({ page }) => {
    await page.goto("/en/faq");
    await expect(page.locator("body")).toContainText(/\?/);
  });
});
