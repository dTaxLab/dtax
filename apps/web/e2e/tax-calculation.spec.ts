import { test, expect } from "./fixtures/auth";

test.describe("Tax Calculation Flow", () => {
  test("should display tax calculation inputs", async ({
    authenticatedPage: page,
  }) => {
    await page.goto("/en/tax");
    await page.waitForLoadState("networkidle");

    // Verify inputs are present
    await expect(page.locator("select").first()).toBeVisible();
    await expect(
      page.getByRole("button", { name: /calculate/i }),
    ).toBeVisible();
  });

  test("should calculate taxes with FIFO method", async ({
    authenticatedPage: page,
  }) => {
    await page.goto("/en/tax");
    await page.waitForLoadState("networkidle");

    // Click calculate
    await page.getByRole("button", { name: /calculate/i }).click();

    // Wait for results — look for gain/loss or summary text
    await expect(
      page.getByText(/short-term|long-term|net|gain|loss/i).first(),
    ).toBeVisible({ timeout: 15000 });
  });

  test("should switch calculation method to LIFO", async ({
    authenticatedPage: page,
  }) => {
    await page.goto("/en/tax");
    await page.waitForLoadState("networkidle");

    // Select LIFO from method dropdown (it's the second select usually)
    const methodSelect = page.locator("select").last();
    await methodSelect.selectOption("LIFO");

    // Calculate
    await page.getByRole("button", { name: /calculate/i }).click();

    // Should show results
    await expect(page.getByText(/LIFO/i)).toBeVisible({ timeout: 15000 });
  });

  test("should show Schedule D section after calculation", async ({
    authenticatedPage: page,
  }) => {
    await page.goto("/en/tax");
    await page.waitForLoadState("networkidle");

    await page.getByRole("button", { name: /calculate/i }).click();

    // Schedule D section should appear
    await expect(page.getByText(/schedule d/i)).toBeVisible({ timeout: 15000 });
  });

  test("should show Form 8949 download buttons", async ({
    authenticatedPage: page,
  }) => {
    await page.goto("/en/tax");
    await page.waitForLoadState("networkidle");

    await page.getByRole("button", { name: /calculate/i }).click();

    // Form 8949 download buttons should appear
    await expect(page.getByText(/form 8949|8949/i).first()).toBeVisible({
      timeout: 15000,
    });

    // Look for download buttons (PDF, CSV, TXF)
    await expect(page.getByRole("button", { name: /pdf/i })).toBeVisible();
  });
});
