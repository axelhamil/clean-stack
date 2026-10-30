import { blockingViolations, corsHeaders, tabTo } from "@packages/test/a11y";
import { expect, type Page, test } from "@playwright/test";
import { STORAGE_STATE } from "./playwright.config";

const ME = {
  id: "staff-id",
  email: "someone@example.com",
  role: "auditor",
  mfa: true,
  stepUpValidUntil: null,
  policy: { requireMfa: true },
};
const ALL_SECTIONS = ["Accounts", "Organizations", "Audit log", "Operations", "Approvals", "Team"];

async function fulfillMe(page: Page, status: number, json: unknown): Promise<void> {
  await page.route("**/admin/me", (route) =>
    route.fulfill({ status, json, headers: corsHeaders(route.request().headers().origin) }),
  );
}

async function refuseMe(page: Page, code: string): Promise<void> {
  await fulfillMe(page, 403, { error: { code, message: `server text for ${code}` } });
}

function navOf(page: Page) {
  return page.getByRole("navigation", { name: "Back office sections" });
}

test("a signed-out visitor is sent to the app's sign-in with the page to come back to", async ({
  page,
}) => {
  await page.goto("/audit?actor=x");

  await expect(page).toHaveURL(/\/sign-in\?redirect=/);
  const redirect = new URL(page.url()).searchParams.get("redirect");
  expect(redirect).toMatch(/\/audit\?actor=x$/);
});

test.describe("signed in", () => {
  test.use({ storageState: STORAGE_STATE });

  test("the nav is exactly what the server's permissions open", async ({ page }) => {
    await fulfillMe(page, 200, { ...ME, permissions: ["users.read", "audit.read"] });
    await page.goto("/");

    await expect(navOf(page).getByRole("link")).toHaveText(["Home", "Accounts", "Audit log"]);
  });

  test("a role alone opens nothing", async ({ page }) => {
    await fulfillMe(page, 200, { ...ME, role: "manager", permissions: [] });
    await page.goto("/");

    await expect(navOf(page).getByRole("link")).toHaveText(["Home"]);
  });

  test("a forbidden section reads like one that does not exist", async ({ page }) => {
    await fulfillMe(page, 200, { ...ME, permissions: ["audit.read"] });

    await page.goto("/team");
    const forbidden = await page.locator("main").textContent();
    await page.goto("/no-such-section");

    expect(await page.locator("main").textContent()).toBe(forbidden);
  });

  test("a refused visitor gets the denied page, with nothing of the back office in it", async ({
    page,
  }) => {
    await refuseMe(page, "ADMIN_STAFF_FORBIDDEN");
    await page.goto("/team");

    await expect(page).toHaveURL(/\/denied$/);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      "This account cannot open the back office",
    );
    await expect(page.getByRole("navigation")).toHaveCount(0);

    const text = (await page.locator("#root").textContent()) ?? "";
    for (const leak of [...ALL_SECTIONS, "server text", "ADMIN_", "manager", "auditor"]) {
      expect(text).not.toContain(leak);
    }
  });

  test("staff without two-factor is told what to do", async ({ page }) => {
    await refuseMe(page, "ADMIN_STAFF_MFA_FORBIDDEN");
    await page.goto("/");

    await expect(page).toHaveURL(/\/denied\?reason=mfa$/);
    await expect(page.getByRole("link", { name: "Go to the app" })).toHaveAttribute(
      "href",
      /\/settings\/account$/,
    );
  });

  test("stale policies point to the app's acceptance page", async ({ page }) => {
    await refuseMe(page, "POLICY_ACCEPTANCE_REQUIRED");
    await page.goto("/");

    await expect(page).toHaveURL(/\/denied\?reason=policies$/);
    await expect(page.getByRole("link", { name: "Go to the app" })).toHaveAttribute(
      "href",
      /\/legal\/accept$/,
    );
  });

  test("the denied page offers a way back once the cause is fixed", async ({ page }) => {
    await refuseMe(page, "ADMIN_STAFF_MFA_FORBIDDEN");
    await page.goto("/");
    await expect(page).toHaveURL(/\/denied/);
    await page.unroute("**/admin/me");
    await fulfillMe(page, 200, { ...ME, permissions: ["users.read"] });

    await page.getByRole("link", { name: "Try again" }).click();

    await expect(page.getByRole("navigation", { name: "Back office sections" })).toBeVisible();
  });

  test("access lost while the page is open cuts on the way back to the tab", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("main")).toHaveCount(1);

    await refuseMe(page, "ADMIN_STAFF_FORBIDDEN");
    await page.evaluate(() => window.dispatchEvent(new Event("visibilitychange")));

    await expect(page).toHaveURL(/\/denied$/);
  });

  test("the sidebar is reachable and ordered with the keyboard", async ({ page }) => {
    await page.goto("/");

    await tabTo(page, navOf(page).getByRole("link", { name: "Home" }));
    await page.keyboard.press("Tab");
    await expect(navOf(page).getByRole("link", { name: "Accounts" })).toBeFocused();
    await page.keyboard.press("Enter");

    await expect(page).toHaveURL(/\/users$/);
  });

  test("the phone menu traps focus, closes on Escape and gives focus back", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/");

    const opener = page.getByRole("button", { name: "Open the menu" });
    await opener.click();
    const drawer = page.getByRole("dialog", { name: "Back office" });
    await expect(drawer).toBeVisible();

    for (let press = 0; press < 10; press += 1) {
      await page.keyboard.press("Tab");
      expect(await drawer.evaluate((node) => node.contains(document.activeElement))).toBe(true);
    }
    expect(await blockingViolations(page, '[role="dialog"]')).toEqual([]);

    await page.keyboard.press("Escape");
    await expect(drawer).toBeHidden();
    await expect(opener).toBeFocused();
  });

  test("a step-up refusal opens the code prompt, which holds and releases focus", async ({
    page,
  }) => {
    await page.goto("/");
    await expect(page.locator("main")).toHaveCount(1);

    await refuseMe(page, "ADMIN_REAUTH_REQUIRED");
    await page.evaluate(() => window.dispatchEvent(new Event("visibilitychange")));

    const prompt = page.getByRole("dialog", { name: "Confirm it's you" });
    await expect(prompt.getByRole("textbox", { name: "Authenticator code" })).toBeFocused();

    for (let press = 0; press < 8; press += 1) {
      await page.keyboard.press("Tab");
      expect(await prompt.evaluate((node) => node.contains(document.activeElement))).toBe(true);
    }
    expect(await blockingViolations(page, '[role="dialog"]')).toEqual([]);

    await page.keyboard.press("Escape");
    await expect(prompt).toBeHidden();
  });
});
