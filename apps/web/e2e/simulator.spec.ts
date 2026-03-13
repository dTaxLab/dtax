import { test, expect } from "./fixtures/auth";

test.describe("Tax Impact Simulator", () => {
  test("should display simulator inputs", async ({
    authenticatedPage: page,
  }) => {
    await page.goto("/en/simulator");
    await page.waitForLoadState("networkidle");

    // Should show input fields
    await expect(page.getByRole("button", { name: /simulate/i })).toBeVisible();
  });

  test("should show compare all button", async ({
    authenticatedPage: page,
  }) => {
    await page.goto("/en/simulator");
    await page.waitForLoadState("networkidle");

    await expect(page.getByRole("button", { name: /compare/i })).toBeVisible();
  });

  test("should show method selection", async ({ authenticatedPage: page }) => {
    await page.goto("/en/simulator");
    await page.waitForLoadState("networkidle");

    // Method select should have FIFO option
    await expect(page.locator("select")).toBeVisible();
  });
});
