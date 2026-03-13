import { test, expect } from "./fixtures/auth";
import path from "path";

test.describe("CSV Import Flow", () => {
  test("should show import panel when import button clicked", async ({
    authenticatedPage: page,
  }) => {
    await page.goto("/en/transactions");
    await page.waitForLoadState("networkidle");

    // Click import button
    const importBtn = page.getByRole("button", { name: /import/i });
    await importBtn.click();

    // Import panel should appear with file input
    await expect(page.locator('input[type="file"]')).toBeVisible();
  });

  test("should import Coinbase CSV and show transactions", async ({
    authenticatedPage: page,
  }) => {
    await page.goto("/en/transactions");
    await page.waitForLoadState("networkidle");

    // Open import panel
    await page.getByRole("button", { name: /import/i }).click();

    // Upload CSV file
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles(
      path.join(__dirname, "test-data/sample-coinbase.csv"),
    );

    // Click the import/upload submit button (look for it in the import panel)
    const submitBtn = page
      .getByRole("button", { name: /import|upload|submit/i })
      .last();
    await submitBtn.click();

    // Wait for import success
    await expect(
      page.getByText(/imported|success|3.*transaction/i),
    ).toBeVisible({ timeout: 15000 });
  });

  test("should display imported transactions in table", async ({
    authenticatedPage: page,
  }) => {
    await page.goto("/en/transactions");
    await page.waitForLoadState("networkidle");

    // Verify BTC and ETH transactions appear
    await expect(page.getByText("BTC")).toBeVisible({ timeout: 5000 });
  });
});
