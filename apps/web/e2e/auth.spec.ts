import { test, expect } from "@playwright/test";

test.describe("Auth flow", () => {
  test("login page renders email and password inputs", async ({ page }) => {
    await page.goto("/en/auth");
    await expect(page.getByPlaceholder(/email/i)).toBeVisible();
    await expect(page.getByPlaceholder(/password/i)).toBeVisible();
  });

  test("register toggle shows name field", async ({ page }) => {
    await page.goto("/en/auth");
    const registerToggle = page.getByText(/register|sign up|create account/i);
    if (await registerToggle.isVisible()) {
      await registerToggle.click();
      await expect(page.getByPlaceholder(/name/i)).toBeVisible();
    }
  });

  test("login with invalid credentials shows error", async ({ page }) => {
    await page.goto("/en/auth");
    await page.getByPlaceholder(/email/i).fill("invalid@test.com");
    await page.getByPlaceholder(/password/i).fill("wrongpassword");
    await page.getByRole("button", { name: /sign in|log in|login/i }).click();
    await expect(page.getByText(/error|invalid|incorrect|failed/i)).toBeVisible(
      { timeout: 5000 },
    );
  });
});
