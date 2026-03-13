import { test, expect } from "./fixtures/auth";

test.describe("Settings Page", () => {
  test("should display user email", async ({ authenticatedPage: page }) => {
    await page.goto("/en/settings");
    await page.waitForLoadState("networkidle");
    await expect(page.getByText("dev@getdtax.com")).toBeVisible({
      timeout: 10000,
    });
  });

  test("should display preferences section with save button", async ({
    authenticatedPage: page,
  }) => {
    await page.goto("/en/settings");
    await page.waitForLoadState("networkidle");
    await expect(page.getByRole("button", { name: /save/i })).toBeVisible();
  });

  test("should display billing section", async ({
    authenticatedPage: page,
  }) => {
    await page.goto("/en/settings");
    await page.waitForLoadState("networkidle");
    // Should show plan badge (FREE for seed user)
    await expect(page.getByText(/free|pro|cpa/i).first()).toBeVisible();
  });

  test("should display 2FA section", async ({ authenticatedPage: page }) => {
    await page.goto("/en/settings");
    await page.waitForLoadState("networkidle");
    // 2FA card should be visible
    await expect(
      page.getByText(/two-factor|2fa|authenticat/i).first(),
    ).toBeVisible();
  });

  test("should display data export button", async ({
    authenticatedPage: page,
  }) => {
    await page.goto("/en/settings");
    await page.waitForLoadState("networkidle");
    await expect(page.getByRole("button", { name: /export/i })).toBeVisible();
  });
});
