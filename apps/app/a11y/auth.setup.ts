import { test as setup } from "@playwright/test";
import { STORAGE_STATE } from "./playwright.config";
import { dismissCookieBanner, signIn } from "./sign-in";

setup("authenticate", async ({ page }) => {
  await page.goto("/sign-in");
  await dismissCookieBanner(page);
  await signIn(page);
  await page.context().storageState({ path: STORAGE_STATE });
});
