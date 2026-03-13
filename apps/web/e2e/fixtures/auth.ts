import { test as base, expect } from "@playwright/test";

type AuthFixture = {
  authenticatedPage: import("@playwright/test").Page;
};

export const test = base.extend<AuthFixture>({
  authenticatedPage: async ({ page }, use) => {
    const res = await page.request.post(
      "http://localhost:3001/api/v1/auth/login",
      {
        data: { email: "dev@getdtax.com", password: "devpassword123" },
      },
    );
    const { data } = await res.json();
    await page.goto("/en");
    await page.evaluate((token) => {
      localStorage.setItem("dtax_token", token);
    }, data.token);
    await page.reload();
    await use(page);
  },
});

export { expect };
