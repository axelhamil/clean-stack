import { audit, COLOR_SCHEMES } from "@packages/test/a11y";
import { test } from "@playwright/test";
import { PUBLIC_PAGES, STAFF_PAGES } from "./pages";
import { BASE_URL, STORAGE_STATE } from "./playwright.config";

for (const colorScheme of COLOR_SCHEMES) {
  test.describe(`public pages (${colorScheme})`, () => {
    test.use({ colorScheme });

    for (const target of PUBLIC_PAGES) {
      test(target.name, async ({ page }) => {
        await audit(page, target, "en");
      });
    }
  });

  test.describe(`staff pages (${colorScheme})`, () => {
    test.use({ storageState: STORAGE_STATE, colorScheme });

    for (const target of STAFF_PAGES) {
      test(target.name, async ({ page }) => {
        await audit(page, target, "en");
      });
    }
  });
}

test.describe("locale resolution (fr)", () => {
  test("the denied page resolves a seeded fr cookie into <html lang>", async ({
    page,
    context,
  }) => {
    await context.addCookies([{ name: "locale", value: "fr", url: BASE_URL, sameSite: "Lax" }]);

    await audit(page, { name: "denied", path: "/denied" }, "fr");
  });
});
