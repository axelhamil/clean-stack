import AxeBuilder from "@axe-core/playwright";
import { DEFAULT_LOCALE, type Locale } from "@packages/i18n";
import { expect, type Page, test } from "@playwright/test";
import { LOCALE_COOKIE } from "../src/shared/i18n/locale-cookie";
import { AUTHENTICATED_PAGES, type AuditedPage, PUBLIC_PAGES } from "./pages";
import { BASE_URL, STORAGE_STATE } from "./playwright.config";

type Violation = Awaited<ReturnType<AxeBuilder["analyze"]>>["violations"][number];

const WCAG_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];
const BLOCKING_IMPACTS = new Set(["serious", "critical"]);
const SCHEMES = ["light", "dark"] as const;
const DEFAULT_LOCALE_UNDER_TEST: Locale = DEFAULT_LOCALE;

function formatViolation(violation: Violation): string {
  const targets = violation.nodes.map((node) => node.target.join(" ")).join(", ");
  return `${violation.id} (${violation.impact}) — ${violation.help} → ${targets}`;
}

async function audit(page: Page, target: AuditedPage, expectedLocale: Locale): Promise<void> {
  await page.goto(target.path);

  // A gate redirect (missing session, stale policies) renders a page that satisfies
  // every assertion below — without this the suite would audit it and report green.
  await expect(page).toHaveURL(new RegExp(`${target.path}$`));
  await expect(page.locator("main")).toHaveCount(1);
  await expect(page.locator("h1")).toHaveCount(1);
  await expect(page.locator("[data-slot=skeleton]")).toHaveCount(0);

  // axe cannot tell that French content is served under lang="en" — html-has-lang
  // passes either way. Asserting equality against the locale this run actually seeded
  // (rather than membership in ["en","fr"]) is what makes a stale, never-synced
  // lang="en" fail: a membership check would pass on that bug trivially.
  await expect(page.locator("html")).toHaveAttribute("lang", expectedLocale);

  const results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
  const blocking = results.violations.filter((v) => BLOCKING_IMPACTS.has(v.impact ?? ""));

  expect(blocking.map(formatViolation)).toEqual([]);
}

for (const colorScheme of SCHEMES) {
  test.describe(`public pages (${colorScheme})`, () => {
    test.use({ colorScheme });

    for (const target of PUBLIC_PAGES) {
      test(target.name, async ({ page }) => {
        await audit(page, target, DEFAULT_LOCALE_UNDER_TEST);
      });
    }
  });

  test.describe(`authenticated pages (${colorScheme})`, () => {
    test.use({ storageState: STORAGE_STATE, colorScheme });

    for (const target of AUTHENTICATED_PAGES) {
      test(target.name, async ({ page }) => {
        await audit(page, target, DEFAULT_LOCALE_UNDER_TEST);
      });
    }
  });
}

// The runs above never set a locale cookie, so `resolveLocale` falls through to the
// browser's default language (Chromium's "en-US") every time — the fr branch of the
// resolver, and of the languageChanged -> <html lang> sync, is never exercised. One
// unauthenticated page is forced to fr here to close that gap without doubling every
// page/scheme combination against the suite's tight per-minute request budget
// (see the rate-limit comment in playwright.config.ts).
test.describe("locale resolution (fr)", () => {
  test.use({ colorScheme: "light" });

  test("sign-in resolves a seeded fr cookie into <html lang>", async ({ page, context }) => {
    const target = PUBLIC_PAGES.find((p) => p.name === "sign-in");
    if (!target) throw new Error("sign-in page missing from PUBLIC_PAGES");

    await context.addCookies([
      { name: LOCALE_COOKIE, value: "fr", url: BASE_URL, sameSite: "Lax" },
    ]);

    await audit(page, target, "fr");
  });
});
