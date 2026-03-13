import { test, expect } from "./fixtures/auth";

test.describe("Transfer Matching", () => {
  test("should display transfers page", async ({ authenticatedPage: page }) => {
    await page.goto("/en/transfers");
    await page.waitForLoadState("networkidle");

    // Should show transfer matching content or empty state
    await expect(page.locator("body")).toContainText(
      /transfer|match|unmatched/i,
    );
  });

  test("should show summary statistics", async ({
    authenticatedPage: page,
  }) => {
    await page.goto("/en/transfers");
    await page.waitForLoadState("networkidle");

    // Summary stats should be visible (matches, unmatched counts)
    await expect(
      page.getByText(/match|found|unmatched/i).first(),
    ).toBeVisible();
  });
});
