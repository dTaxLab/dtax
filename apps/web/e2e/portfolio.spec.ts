import { test, expect } from "./fixtures/auth";

test.describe("Portfolio Page", () => {
  test("should display portfolio page", async ({ authenticatedPage: page }) => {
    await page.goto("/en/portfolio");
    await page.waitForLoadState("networkidle");

    // Should show portfolio content (cost basis or empty state)
    await expect(page.locator("body")).toContainText(
      /portfolio|cost basis|holdings|position/i,
    );
  });

  test("should show price input section", async ({
    authenticatedPage: page,
  }) => {
    await page.goto("/en/portfolio");
    await page.waitForLoadState("networkidle");

    // Should have price-related elements
    await expect(page.getByText(/price/i).first()).toBeVisible();
  });
});
