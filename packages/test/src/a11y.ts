import AxeBuilder from "@axe-core/playwright";
import { expect, type Locator, type Page } from "@playwright/test";

type Violation = Awaited<ReturnType<AxeBuilder["analyze"]>>["violations"][number];

const WCAG_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];
const BLOCKING_IMPACTS = new Set(["serious", "critical"]);

export const COLOR_SCHEMES = ["light", "dark"] as const;

export interface AuditedPage {
  readonly name: string;
  readonly path: string;
  readonly prepare?: (page: Page) => Promise<void>;
}

/** Defaults mirror `apps/api/scripts/seed-dev-user.ts`: change both together. */
export const SEED_EMAIL = process.env.SEED_EMAIL ?? "dev@example.com";
export const SEED_PASSWORD = process.env.SEED_PASSWORD ?? "Nimbus-Harbor-42-Quartz";

function formatViolation(violation: Violation): string {
  const targets = violation.nodes.map((node) => node.target.join(" ")).join(", ");
  return `${violation.id} (${violation.impact}): ${violation.help} → ${targets}`;
}

export async function blockingViolations(page: Page, include?: string): Promise<string[]> {
  const builder = new AxeBuilder({ page }).withTags(WCAG_TAGS);
  const results = await (include ? builder.include(include) : builder).analyze();

  return results.violations
    .filter((v) => BLOCKING_IMPACTS.has(v.impact ?? ""))
    .map(formatViolation);
}

export async function audit(
  page: Page,
  target: AuditedPage,
  expectedLocale: string,
): Promise<void> {
  await target.prepare?.(page);
  await page.goto(target.path);

  // A gate redirect (missing session, stale policies) renders a page that satisfies
  // every assertion below; without this the suite would audit it and report green.
  await expect(page).toHaveURL(new RegExp(`${target.path}$`));
  await expect(page.locator("main")).toHaveCount(1);
  await expect(page.locator("h1")).toHaveCount(1);
  await expect(page.locator("[data-slot=skeleton]")).toHaveCount(0);

  // axe cannot tell that French content is served under lang="en": html-has-lang
  // passes either way. Asserting equality against the locale this run actually seeded
  // (rather than membership in ["en","fr"]) is what makes a stale, never-synced
  // lang="en" fail: a membership check would pass on that bug trivially.
  await expect(page.locator("html")).toHaveAttribute("lang", expectedLocale);

  expect(await blockingViolations(page)).toEqual([]);
}

/**
 * `/sign-in` can mount several forms whose email field carries the same label:
 * the credentials form and whichever alternative (magic link, SSO) is open.
 * Scoping by the submit button is what keeps the locators unambiguous.
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
 * Types the credentials with the keyboard only. Keyboard rather than clicks because
 * `/sign-in` is capped at 5 attempts per 15 min per IP: one shared sign-in per run is
 * the budget, so it doubles as the WCAG 2.1.1 keyboard-operability check.
 */
export async function submitCredentials(
  page: Page,
  email: string,
  password: string,
): Promise<void> {
  const form = signInForm(page);

  await tabTo(page, form.getByLabel("Email", { exact: true }));
  await page.keyboard.type(email);
  await page.keyboard.press("Tab");
  await page.keyboard.type(password);
  await page.keyboard.press("Enter");
}
