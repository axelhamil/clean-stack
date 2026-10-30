import AxeBuilder from "@axe-core/playwright";
import { signInForm, tabTo } from "@packages/test/a11y";
import { expect, type Page, test } from "@playwright/test";
import { STORAGE_STATE } from "./playwright.config";

type ThemeProbe = Window & { __themeTransitioned?: boolean };

const STEP_UP_TARGET = "a11y-step-up-target";

async function fulfillAsStaffWithRefusedImpersonation(page: Page): Promise<void> {
  const allow = (origin?: string) => ({
    "access-control-allow-origin": origin ?? "*",
    "access-control-allow-credentials": "true",
  });

  await page.route("**/api/auth/get-session*", async (route) => {
    const response = await route.fetch();
    const session = await response.json();
    await route.fulfill({
      response,
      json: {
        ...session,
        staff: { role: "manager", permissions: ["users.read", "users.impersonate"], mfaOk: true },
      },
    });
  });
  await page.route(`**/admin/users/${STEP_UP_TARGET}`, (route) => {
    if (route.request().resourceType() === "document") return route.fallback();

    return route.fulfill({
      headers: allow(route.request().headers().origin),
      json: {
        id: STEP_UP_TARGET,
        name: "Step-up target",
        email: "step-up-target@example.com",
        emailVerified: true,
        role: "user",
        banned: false,
        banReason: null,
        banExpires: null,
        createdAt: new Date().toISOString(),
        sessions: [],
        memberships: [],
      },
    });
  });
  await page.route(`**/admin/impersonation/${STEP_UP_TARGET}/start`, (route) =>
    route.fulfill({
      status: 403,
      headers: allow(route.request().headers().origin),
      json: { error: { code: "ADMIN_REAUTH_REQUIRED", message: "Confirm." } },
    }),
  );
}

test("reaches every sign-in control in order with the keyboard", async ({ page }) => {
  await page.goto("/sign-in");

  const form = signInForm(page);
  await tabTo(page, form.getByLabel("Email", { exact: true }));

  await page.keyboard.press("Tab");
  await expect(form.getByLabel("Password", { exact: true })).toBeFocused();

  await page.keyboard.press("Tab");
  await expect(form.getByRole("checkbox", { name: "Remember me" })).toBeFocused();

  await page.keyboard.press("Tab");
  await expect(form.getByRole("button", { name: "Sign in", exact: true })).toBeFocused();
});

test("reaches and operates the SSO entry with the keyboard", async ({ page }) => {
  await page.goto("/sign-in");

  // The passkey button only renders once `PublicKeyCredential` support resolves
  // (async, conditional); `tabTo` rather than a fixed Tab count skips past it
  // whether or not it showed up, same as every other control on this page.
  const ssoTrigger = page.getByRole("button", { name: "Sign in with SSO", exact: true });
  await tabTo(page, ssoTrigger);

  // Space activates a focused button the same way a click does: this both proves
  // the trigger is keyboard-operable and expands the collapsible for the next step.
  await page.keyboard.press(" ");

  const ssoForm = page
    .locator("form")
    .filter({ has: page.getByRole("button", { name: "Continue", exact: true }) });
  const ssoEmail = ssoForm.getByLabel("Email", { exact: true });
  await expect(ssoEmail).toBeVisible();

  // Revealing the field must not break focus order: the very next stop from the
  // trigger has to be the field it just revealed.
  await page.keyboard.press("Tab");
  await expect(ssoEmail).toBeFocused();

  await page.keyboard.press("Tab");
  await expect(ssoForm.getByRole("button", { name: "Continue", exact: true })).toBeFocused();
});

test.describe("signed in", () => {
  test.use({ storageState: STORAGE_STATE });

  test("opens the step-up prompt over a refused action and gives focus back on Escape", async ({
    page,
  }) => {
    await fulfillAsStaffWithRefusedImpersonation(page);
    await page.goto(`/admin/users/${STEP_UP_TARGET}`);

    await page.getByRole("button", { name: "Impersonate", exact: true }).click();
    const action = page.getByRole("dialog", { name: "Impersonate account" });
    const reason = action.getByRole("textbox", { name: "Reason" });
    await reason.fill("ticket 42");
    await action.getByRole("button", { name: "Start impersonation" }).click();

    const prompt = page.getByRole("dialog", { name: "Confirm it's you" });
    const code = prompt.getByRole("textbox", { name: "Authenticator code" });
    await expect(code).toBeFocused();

    for (let press = 0; press < 8; press += 1) {
      await page.keyboard.press("Tab");
      const inside = await prompt.evaluate((node) => node.contains(document.activeElement));
      expect(inside).toBe(true);
    }

    const audit = await new AxeBuilder({ page })
      .include('[role="dialog"]')
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();
    const blocking = audit.violations.filter(
      (violation) => violation.impact === "serious" || violation.impact === "critical",
    );
    expect(blocking).toEqual([]);

    await page.keyboard.press("Escape");
    await expect(prompt).toBeHidden();
    await expect(action).toBeVisible();
    const backInside = await action.evaluate((node) => node.contains(document.activeElement));
    expect(backInside).toBe(true);
  });

  test("ignores a code refusal that lands after the prompt was cancelled", async ({ page }) => {
    await fulfillAsStaffWithRefusedImpersonation(page);
    await page.route("**/admin/step-up", async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 500));
      await route.fulfill({
        status: 400,
        headers: {
          "access-control-allow-origin": route.request().headers().origin ?? "*",
          "access-control-allow-credentials": "true",
        },
        json: { error: { code: "ADMIN_STEP_UP_CODE_INVALID", message: "Invalid." } },
      });
    });
    await page.goto(`/admin/users/${STEP_UP_TARGET}`);

    await page.getByRole("button", { name: "Impersonate", exact: true }).click();
    const action = page.getByRole("dialog", { name: "Impersonate account" });
    await action.getByRole("textbox", { name: "Reason" }).fill("ticket 42");
    const start = action.getByRole("button", { name: "Start impersonation" });
    await start.click();

    const prompt = page.getByRole("dialog", { name: "Confirm it's you" });
    await prompt.getByRole("textbox", { name: "Authenticator code" }).fill("123456");
    await prompt.getByRole("button", { name: "Confirm" }).click();
    await prompt.getByRole("button", { name: "Cancel" }).click();
    await expect(prompt).toBeHidden();

    const refusal = page.waitForResponse("**/admin/step-up");
    await refusal;
    await start.click();
    await expect(prompt).toBeVisible();
    await expect(prompt.getByRole("textbox", { name: "Authenticator code" })).toHaveValue("");
    await expect(prompt.getByText("This code is not valid")).toBeHidden();
  });

  test("traps focus inside the command palette", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page.locator("main")).toBeVisible();

    await page.keyboard.press("ControlOrMeta+k");
    const palette = page.getByRole("dialog", { name: "Command palette" });
    await expect(palette).toBeVisible();

    for (let i = 0; i < 10; i++) {
      await page.keyboard.press("Tab");
      const contained = await palette.evaluate((el) => el.contains(document.activeElement));
      expect(contained, `focus escaped the palette after ${i + 1} Tab presses`).toBe(true);
    }

    await page.keyboard.press("Escape");
    await expect(palette).toBeHidden();
  });

  for (const width of [390, 768, 1440]) {
    test(`keeps the shell inside a ${width} px viewport with long names`, async ({ page }) => {
      const longName = "Compagnie Internationale des Transports Maritimes et Fluviaux";
      await page.route(/\/api\/auth\//, async (route) => {
        const response = await route.fetch();
        const body = (await response.text()).replace(/"name":"[^"]*"/g, `"name":"${longName}"`);
        await route.fulfill({ response, body });
      });
      await page.setViewportSize({ width, height: 800 });

      await page.goto("/settings/api-tokens");

      const activeTab = page
        .getByRole("navigation", { name: "Settings sections" })
        .locator("a[data-active]");
      await expect(activeTab).toBeInViewport({ ratio: 1 });
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow).toBe(0);
      await page.unrouteAll({ behavior: "ignoreErrors" });
    });
  }

  test("opens an icon button tooltip on keyboard focus and closes it with Escape", async ({
    page,
  }) => {
    await page.goto("/dashboard");

    const toggle = page.getByRole("button", { name: /Switch to (dark|light) theme/ });
    await tabTo(page, toggle);

    const tooltip = page.getByRole("tooltip").filter({ hasText: /Switch to (dark|light) theme/ });
    await expect(tooltip).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(tooltip).toBeHidden();
    await expect(toggle).toBeFocused();
  });

  test("closes a dialog with one Escape while a tooltip is open inside it", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page.locator("main")).toBeVisible();

    await page.keyboard.press("ControlOrMeta+k");
    const palette = page.getByRole("dialog", { name: "Command palette" });
    await expect(palette).toBeVisible();

    await page.keyboard.press("Tab");
    await expect(page.getByRole("tooltip").filter({ hasText: "Close" })).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(palette).toBeHidden();
  });

  test("explains a disabled control from a keyboard stop on its hint", async ({ page }) => {
    await page.goto("/settings/privacy");

    const frozen = page.getByRole("switch", { name: "Strictly necessary" });
    await expect(frozen).toBeDisabled();

    const hint = page.getByRole("group").filter({ has: frozen });
    await expect(hint).toHaveAccessibleDescription(/cannot be turned off/);

    await tabTo(page, hint.locator("[tabindex='0']"));
    await expect(
      page.getByRole("tooltip").filter({ hasText: /cannot be turned off/ }),
    ).toBeVisible();
  });

  test("reaches the primary navigation from the user menu on a phone", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 800 });

    await page.goto("/dashboard");
    await page.getByRole("button", { name: "Open user menu" }).click();
    await page.getByRole("menuitem", { name: "Settings" }).click();

    await expect(page).toHaveURL(/\/settings/);
  });

  test("skips the theme view transition under reduced motion", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.addInitScript(() => {
      new MutationObserver((records) => {
        for (const record of records) {
          const target = record.target as Element;
          if (target.classList?.contains("theme-transitioning")) {
            (window as ThemeProbe).__themeTransitioned = true;
          }
        }
      }).observe(document, { attributes: true, subtree: true, attributeFilter: ["class"] });
    });

    await page.goto("/dashboard");

    const isDark = () => page.evaluate(() => document.documentElement.classList.contains("dark"));
    const before = await isDark();

    await page.getByRole("button", { name: /Switch to (dark|light) theme/ }).click();

    await expect.poll(isDark).toBe(!before);
    const transitioned = await page.evaluate(
      () => (window as ThemeProbe).__themeTransitioned === true,
    );
    expect(transitioned).toBe(false);
  });
});
