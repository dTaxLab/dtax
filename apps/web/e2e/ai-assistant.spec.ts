import { test, expect } from "./fixtures/auth";

test.describe("AI Assistant", () => {
  test("should display chat interface", async ({ authenticatedPage: page }) => {
    await page.goto("/en/ai-assistant");
    await page.waitForLoadState("networkidle");

    // Should show new conversation button
    await expect(
      page.getByRole("button", { name: /new.*conversation|new.*chat/i }),
    ).toBeVisible();
  });

  test("should show chat input area", async ({ authenticatedPage: page }) => {
    await page.goto("/en/ai-assistant");
    await page.waitForLoadState("networkidle");

    // Should have a text input or textarea for messages
    const input = page.locator('input[type="text"], textarea').last();
    await expect(input).toBeVisible();
  });

  test("should create new conversation and show message input", async ({
    authenticatedPage: page,
  }) => {
    await page.goto("/en/ai-assistant");
    await page.waitForLoadState("networkidle");

    // Click new conversation
    await page
      .getByRole("button", { name: /new.*conversation|new.*chat/i })
      .click();

    // Input should still be visible
    const input = page.locator('input[type="text"], textarea').last();
    await expect(input).toBeVisible();
  });
});
