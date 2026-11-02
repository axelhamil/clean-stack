import { dismissCookieBanner, SEED_PASSWORD, submitCredentials } from "@packages/test/a11y";
import { expect, test as setup } from "@playwright/test";
import { APP_URL, BASE_URL, STORAGE_STATE } from "./playwright.config";
import { currentStaffCode, STAFF_MANAGER_EMAIL } from "./staff";

// One real journey, and the only sign-in this suite spends: signed out on the back
// office, through the customer app's sign-in and code step, back where it started.
setup("signs in through the app and returns to the back office", async ({ page }) => {
  const target = `${BASE_URL}/users`;

  await page.goto(target);
  await expect(page).toHaveURL(`${APP_URL}/sign-in?redirect=${encodeURIComponent(target)}`);

  await dismissCookieBanner(page);
  await submitCredentials(page, STAFF_MANAGER_EMAIL, SEED_PASSWORD);

  await page.waitForURL(/\/two-factor/);
  await page.getByLabel("Authentication code").fill(await currentStaffCode());
  await page.getByRole("button", { name: "Verify", exact: true }).click();

  await page.waitForURL(target);
  await page.context().storageState({ path: STORAGE_STATE });
});
