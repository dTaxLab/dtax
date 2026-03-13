import { test, expect } from "@playwright/test";

test.describe("Onboarding Wizard", () => {
  test("should show onboarding page with role selection", async ({ page }) => {
    await page.goto("/en/onboarding");
    await page.waitForLoadState("networkidle");

    // Should show step indicator
    await expect(page.getByText(/1.*of|step.*1/i)).toBeVisible();

    // Should show role options
    await expect(page.getByText(/individual/i)).toBeVisible();
    await expect(page.getByText(/trader/i)).toBeVisible();
    await expect(page.getByText(/cpa/i)).toBeVisible();
  });

  test("should have skip button available", async ({ page }) => {
    await page.goto("/en/onboarding");
    await page.waitForLoadState("networkidle");

    await expect(page.getByRole("button", { name: /skip/i })).toBeVisible();
  });

  test("should navigate to step 2 after selecting role", async ({ page }) => {
    await page.goto("/en/onboarding");
    await page.waitForLoadState("networkidle");

    // Select Individual role
    await page.getByText(/individual/i).click();

    // Click Next
    await page.getByRole("button", { name: /next/i }).click();

    // Should be on step 2 - exchange selection
    await expect(page.getByText(/2.*of|step.*2/i)).toBeVisible();
    await expect(page.getByText(/coinbase/i)).toBeVisible();
  });

  test("should show progress bar", async ({ page }) => {
    await page.goto("/en/onboarding");
    await page.waitForLoadState("networkidle");

    // Progress bar should exist (look for a div with width style)
    const progressBar = page.locator('[style*="width"]').first();
    await expect(progressBar).toBeVisible();
  });
});
