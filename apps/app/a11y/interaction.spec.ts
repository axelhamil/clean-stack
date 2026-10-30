import { expect, test } from "@playwright/test";
import { STORAGE_STATE } from "./playwright.config";
import { signInForm, tabTo } from "./sign-in";

type ThemeProbe = Window & { __themeTransitioned?: boolean };

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
