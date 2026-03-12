import { test, expect } from "@playwright/test";

test.describe("Navigation", () => {
  test("public pages accessible without auth", async ({ page }) => {
    await page.goto("/en/pricing");
    await expect(page).not.toHaveURL(/\/auth/);
    await expect(page.locator("body")).toContainText(/free|pro|pricing/i);

    await page.goto("/en/features");
    await expect(page).not.toHaveURL(/\/auth/);

    await page.goto("/en/exchanges");
    await expect(page).not.toHaveURL(/\/auth/);
  });

  test("protected pages redirect to /auth when not logged in", async ({
    page,
  }) => {
    await page.goto("/en/transactions");
    await expect(page).toHaveURL(/\/auth/);
  });

  test("landing page renders hero section", async ({ page }) => {
    await page.goto("/en");
    await expect(page.locator("body")).toContainText(/dtax|tax|crypto/i);
  });

  test("language switch between EN and ZH", async ({ page }) => {
    await page.goto("/en/pricing");
    const bodyText = await page.locator("body").textContent();
    expect(bodyText).toBeTruthy();

    await page.goto("/zh/pricing");
    const zhBodyText = await page.locator("body").textContent();
    expect(zhBodyText).toBeTruthy();
    expect(zhBodyText).not.toBe(bodyText);
  });
});
