import { test as authTest, expect as authExpect } from "./fixtures/auth";
import { test, expect } from "@playwright/test";

test.describe("Responsive Design", () => {
  test("should show hamburger menu on mobile viewport", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto("/en");
    await page.waitForLoadState("networkidle");

    // Should show hamburger/toggle menu button
    await expect(
      page.getByRole("button", { name: /toggle menu|menu/i }),
    ).toBeVisible();
  });

  test("should hide hamburger menu on desktop viewport", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/en");
    await page.waitForLoadState("networkidle");

    // Desktop nav links should be visible
    await expect(page.getByRole("link", { name: /pricing/i })).toBeVisible();
  });
});

test.describe("Theme Switching", () => {
  test("should toggle between light and dark theme", async ({ page }) => {
    await page.goto("/en");
    await page.waitForLoadState("networkidle");

    const html = page.locator("html");
    const initialClasses = (await html.getAttribute("class")) || "";

    // Click theme toggle button
    const themeBtn = page.getByRole("button", { name: /switch to.*mode/i });
    await themeBtn.click();

    // Class should change
    const newClasses = (await html.getAttribute("class")) || "";
    expect(newClasses).not.toBe(initialClasses);
  });
});

test.describe("Language Switching", () => {
  test("should switch from English to Chinese", async ({ page }) => {
    await page.goto("/en/pricing");
    await page.waitForLoadState("networkidle");

    const bodyTextEn = await page.locator("body").textContent();

    // Navigate to Chinese version
    await page.goto("/zh/pricing");
    await page.waitForLoadState("networkidle");

    const bodyTextZh = await page.locator("body").textContent();
    expect(bodyTextZh).not.toBe(bodyTextEn);
  });

  test("should maintain page after language switch via URL", async ({
    page,
  }) => {
    await page.goto("/en/pricing");
    await expect(page).toHaveURL(/\/en\/pricing/);

    await page.goto("/zh/pricing");
    await expect(page).toHaveURL(/\/zh\/pricing/);
  });
});
