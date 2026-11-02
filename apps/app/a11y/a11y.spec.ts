import { DEFAULT_LOCALE, type Locale } from "@packages/i18n";
import { audit, COLOR_SCHEMES } from "@packages/test/a11y";
import { LOCALE_COOKIE } from "@packages/web-kit/i18n/locale-cookie";
import { test } from "@playwright/test";
import { AUTHENTICATED_PAGES, PUBLIC_PAGES } from "./pages";
import { BASE_URL, STORAGE_STATE } from "./playwright.config";

const DEFAULT_LOCALE_UNDER_TEST: Locale = DEFAULT_LOCALE;

for (const colorScheme of COLOR_SCHEMES) {
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
// browser's default language (Chromium's "en-US") every time, so the fr branch of the
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
