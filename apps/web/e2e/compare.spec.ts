import { test, expect } from "./fixtures/auth";

test.describe("Year-over-Year Compare", () => {
  test("should display compare page with year selector", async ({
    authenticatedPage: page,
  }) => {
    await page.goto("/en/compare");
    await page.waitForLoadState("networkidle");

    // Should show year selection or compare elements
    await expect(page.getByRole("button", { name: /compare/i })).toBeVisible();
  });

  test("should show method selector", async ({ authenticatedPage: page }) => {
    await page.goto("/en/compare");
    await page.waitForLoadState("networkidle");

    await expect(page.locator("select")).toBeVisible();
  });
});
