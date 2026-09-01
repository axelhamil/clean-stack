import type { Locator, Page } from "@playwright/test";

/** Defaults mirror `apps/api/scripts/seed-dev-user.ts` — change both together. */
export const SEED_EMAIL = process.env.SEED_EMAIL ?? "dev@example.com";
export const SEED_PASSWORD = process.env.SEED_PASSWORD ?? "Nimbus-Harbor-42-Quartz";

/**
 * `/sign-in` renders two forms whose email field carries the same label — the
 * credentials form and the magic-link one. Scoping by the submit button is what
 * keeps the locators unambiguous.
 */
export function signInForm(page: Page): Locator {
  return page
    .locator("form")
    .filter({ has: page.getByRole("button", { name: "Sign in", exact: true }) });
}

export async function tabTo(page: Page, target: Locator, maxPresses = 20): Promise<void> {
  for (let i = 0; i < maxPresses; i++) {
    if (await target.evaluate((el) => el === document.activeElement)) return;
    await page.keyboard.press("Tab");
  }
  throw new Error(`Target never received focus after ${maxPresses} Tab presses`);
}

export async function dismissCookieBanner(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Reject all" }).click();
  await page.getByRole("dialog", { name: "Cookie consent" }).waitFor({ state: "hidden" });
}

/**
 * Signs in using the keyboard only, clearing the legal-acceptance gate when it
 * stands in the way. Keyboard rather than clicks because `/sign-in` is capped at
 * 5 attempts per 15 min per IP: one shared sign-in per run is the budget, so it
 * doubles as the WCAG 2.1.1 keyboard-operability check.
 */
export async function signIn(page: Page): Promise<void> {
  const form = signInForm(page);

  await tabTo(page, form.getByLabel("Email", { exact: true }));
  await page.keyboard.type(SEED_EMAIL);
  await page.keyboard.press("Tab");
  await page.keyboard.type(SEED_PASSWORD);
  await page.keyboard.press("Enter");

  await page.waitForURL(/\/(dashboard|legal\/accept)/);

  if (page.url().includes("/legal/accept")) {
    await page.getByRole("button", { name: "Accept and continue" }).click();
    await page.waitForURL(/\/dashboard/);
  }
}
