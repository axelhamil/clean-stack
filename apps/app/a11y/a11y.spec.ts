import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";
import { AUTHENTICATED_PAGES, type AuditedPage, PUBLIC_PAGES } from "./pages";
import { STORAGE_STATE } from "./playwright.config";

type Violation = Awaited<ReturnType<AxeBuilder["analyze"]>>["violations"][number];

const WCAG_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];
const BLOCKING_IMPACTS = new Set(["serious", "critical"]);
const SCHEMES = ["light", "dark"] as const;

function formatViolation(violation: Violation): string {
  const targets = violation.nodes.map((node) => node.target.join(" ")).join(", ");
  return `${violation.id} (${violation.impact}) — ${violation.help} → ${targets}`;
}

async function audit(page: Page, target: AuditedPage): Promise<void> {
  await page.goto(target.path);

  // A gate redirect (missing session, stale policies) renders a page that satisfies
  // every assertion below — without this the suite would audit it and report green.
  await expect(page).toHaveURL(new RegExp(`${target.path}$`));
  await expect(page.locator("main")).toHaveCount(1);
  await expect(page.locator("h1")).toHaveCount(1);
  await expect(page.locator("[data-slot=skeleton]")).toHaveCount(0);

  const results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
  const blocking = results.violations.filter((v) => BLOCKING_IMPACTS.has(v.impact ?? ""));

  expect(blocking.map(formatViolation)).toEqual([]);
}

for (const colorScheme of SCHEMES) {
  test.describe(`public pages (${colorScheme})`, () => {
    test.use({ colorScheme });

    for (const target of PUBLIC_PAGES) {
      test(target.name, async ({ page }) => {
        await audit(page, target);
      });
    }
  });

  test.describe(`authenticated pages (${colorScheme})`, () => {
    test.use({ storageState: STORAGE_STATE, colorScheme });

    for (const target of AUTHENTICATED_PAGES) {
      test(target.name, async ({ page }) => {
        await audit(page, target);
      });
    }
  });
}
