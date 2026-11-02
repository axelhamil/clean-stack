import { SEED_EMAIL, SEED_PASSWORD, submitCredentials } from "@packages/test/a11y";
import type { Page } from "@playwright/test";

/** Signs in with the seeded account, clearing the legal-acceptance gate when it stands in the way. */
export async function signIn(page: Page): Promise<void> {
  await submitCredentials(page, SEED_EMAIL, SEED_PASSWORD);

  await page.waitForURL(/\/(dashboard|legal\/accept)/);

  if (page.url().includes("/legal/accept")) {
    await page.getByRole("button", { name: "Accept and continue" }).click();
    await page.waitForURL(/\/dashboard/);
  }
}
