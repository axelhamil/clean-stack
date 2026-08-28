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
  // (async, conditional) — `tabTo` rather than a fixed Tab count skips past it
  // whether or not it showed up, same as every other control on this page.
  const ssoTrigger = page.getByRole("button", { name: "Sign in with SSO", exact: true });
  await tabTo(page, ssoTrigger);

  // Space activates a focused button the same way a click does — this both proves
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
    const palette = page.getByRole("dialog", { name: "Command Palette" });
    await expect(palette).toBeVisible();

    for (let i = 0; i < 10; i++) {
      await page.keyboard.press("Tab");
      const contained = await palette.evaluate((el) => el.contains(document.activeElement));
      expect(contained, `focus escaped the palette after ${i + 1} Tab presses`).toBe(true);
    }

    await page.keyboard.press("Escape");
    await expect(palette).toBeHidden();
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
