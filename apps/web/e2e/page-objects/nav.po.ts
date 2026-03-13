import { Page, Locator } from "@playwright/test";

export class NavPO {
  readonly page: Page;
  readonly dashboardLink: Locator;
  readonly transactionsLink: Locator;
  readonly taxLink: Locator;
  readonly portfolioLink: Locator;
  readonly settingsLink: Locator;

  constructor(page: Page) {
    this.page = page;
    this.dashboardLink = page.getByRole("link", { name: /dashboard/i });
    this.transactionsLink = page.getByRole("link", { name: /transactions/i });
    this.taxLink = page.getByRole("link", { name: /tax/i });
    this.portfolioLink = page.getByRole("link", { name: /portfolio/i });
    this.settingsLink = page.getByRole("link", { name: /settings/i });
  }

  async navigateTo(link: Locator) {
    await link.click();
    await this.page.waitForLoadState("networkidle");
  }
}
