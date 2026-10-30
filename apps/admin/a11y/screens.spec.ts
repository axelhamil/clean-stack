import { blockingViolations, corsHeaders } from "@packages/test/a11y";
import { expect, type Locator, type Page, test } from "@playwright/test";
import { STORAGE_STATE } from "./playwright.config";
import {
  STUB_APPROVAL,
  STUB_MEMBERS,
  STUB_ORG,
  STUB_OVERRIDE,
  STUB_USER,
  STUB_USER_ID,
} from "./stubs";

const USER_PATH = `/users/${STUB_USER_ID}`;
const ALL_PERMISSIONS = [
  "users.read",
  "users.moderate",
  "users.impersonate",
  "orgs.read",
  "orgs.sso",
  "audit.read",
  "approvals.decide",
  "staff.manage",
];

async function stub(page: Page, path: string, json: unknown, status = 200): Promise<void> {
  await page.route(path, (route) =>
    route.fulfill({ status, json, headers: corsHeaders(route.request().headers().origin) }),
  );
}

async function stubMe(page: Page, permissions: readonly string[]): Promise<void> {
  await stub(page, "**/admin/me", {
    id: "staff-id",
    email: "someone@example.com",
    role: "manager",
    mfa: true,
    stepUpValidUntil: null,
    policy: { requireMfa: true },
    permissions,
  });
}

async function stubDetailData(page: Page): Promise<void> {
  await stub(page, `**/admin/users/${STUB_USER_ID}`, STUB_USER);
  await stub(page, "**/admin/users?*", { items: [STUB_USER], nextCursor: null });
  await stub(page, "**/admin/orgs/org-stub", STUB_ORG);
  await stub(page, "**/admin/orgs?*", { items: [STUB_ORG], nextCursor: null });
  await stub(page, "**/admin/approvals/approval-stub", STUB_APPROVAL);
  await stub(page, "**/admin/approvals?*", { items: [STUB_APPROVAL], nextCursor: null });
  await stub(page, "**/admin/staff", { items: STUB_MEMBERS });
  await stub(page, "**/admin/staff/member-stub/overrides", { items: [STUB_OVERRIDE] });
}

async function expectHoldsFocus(page: Page, dialog: Locator, opener: Locator): Promise<void> {
  await expect(dialog).toBeVisible();

  for (let press = 0; press < 8; press += 1) {
    await page.keyboard.press("Tab");
    expect(await dialog.evaluate((node) => node.contains(document.activeElement))).toBe(true);
  }
  expect(await blockingViolations(page, '[role="dialog"], [role="alertdialog"]')).toEqual([]);

  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(opener).toBeFocused();
}

test.describe("back office screens", () => {
  test.use({ storageState: STORAGE_STATE });

  test.beforeEach(async ({ page }) => {
    await stubMe(page, ALL_PERMISSIONS);
    await stubDetailData(page);
  });

  for (const [name, button, role, dialogName] of [
    ["suspend", "Suspend", "dialog", "Suspend account"],
    ["impersonate", "Impersonate", "dialog", "Impersonate account"],
    ["revoke sessions", "Revoke sessions", "alertdialog", "Revoke every session?"],
    ["reset password", "Reset password", "alertdialog", "Send a password reset?"],
  ] as const) {
    test(`the ${name} dialog holds and gives back focus`, async ({ page }) => {
      await page.goto(USER_PATH);

      const opener = page.getByRole("button", { name: button, exact: true });
      await opener.click();

      await expectHoldsFocus(page, page.getByRole(role, { name: dialogName }), opener);
    });
  }

  test("the manage dialog holds and gives back focus, and shows the live override", async ({
    page,
  }) => {
    await page.goto("/team");

    const opener = page.getByRole("button", { name: "Manage" });
    await opener.click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByText("Decide approvals")).toBeVisible();

    await expectHoldsFocus(page, dialog, opener);
  });

  test("the add person dialog holds and gives back focus", async ({ page }) => {
    await page.goto("/team");

    const opener = page.getByRole("button", { name: "Add a person" });
    await opener.click();

    await expectHoldsFocus(page, page.getByRole("dialog"), opener);
  });

  for (const decision of ["Approve", "Reject"] as const) {
    test(`the ${decision} dialog requires a note, holds and gives back focus`, async ({ page }) => {
      await page.goto("/approvals/approval-stub");

      const opener = page.getByRole("button", { name: decision });
      await opener.click();
      const dialog = page.getByRole("dialog");
      await dialog.getByRole("button", { name: decision }).click();
      await expect(dialog.getByRole("textbox")).toHaveAttribute("aria-invalid", "true");

      await expectHoldsFocus(page, dialog, opener);
    });
  }

  test("a held ban says it waits for a colleague and offers to cancel", async ({ page }) => {
    await stub(page, `**/admin/users/${STUB_USER_ID}/ban`, { approvalId: "approval-stub" }, 202);
    await page.goto(USER_PATH);

    await page.getByRole("button", { name: "Suspend", exact: true }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByRole("textbox", { name: "Reason" }).fill("Fraud report 1284");
    await dialog.getByRole("button", { name: "Suspend account" }).click();

    await expect(page.getByText("waiting for a colleague's approval")).toBeVisible();
    await expect(page.getByRole("button", { name: "Cancel the request" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Open the request" })).toHaveAttribute(
      "href",
      "/approvals/approval-stub",
    );
  });

  test("a step-up refusal keeps the sensitive form open under the code prompt", async ({
    page,
  }) => {
    await stub(
      page,
      `**/admin/users/${STUB_USER_ID}/ban`,
      { error: { code: "ADMIN_REAUTH_REQUIRED", message: "x" } },
      403,
    );
    await page.goto(USER_PATH);

    await page.getByRole("button", { name: "Suspend", exact: true }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByRole("textbox", { name: "Reason" }).fill("Fraud report 1284");
    await dialog.getByRole("button", { name: "Suspend account" }).click();

    await expect(page.getByRole("dialog", { name: "Confirm it's you" })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("textbox", { name: "Reason" })).toHaveValue("Fraud report 1284");
  });

  test("the requester of a pending approval can cancel but not decide", async ({ page }) => {
    await stub(page, "**/admin/approvals/approval-stub", {
      ...STUB_APPROVAL,
      requestedBy: "staff-id",
    });
    await page.goto("/approvals/approval-stub");

    await expect(page.getByRole("button", { name: "Cancel the request" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Approve" })).toHaveCount(0);
  });

  test("an approver without the action's own permission is not offered the decision", async ({
    page,
  }) => {
    await page.unroute("**/admin/me");
    await stubMe(page, ["approvals.decide"]);
    await page.goto("/approvals/approval-stub");

    await expect(page.getByText("A colleague who can do this action")).toBeVisible();
    await expect(page.getByRole("button", { name: "Approve" })).toHaveCount(0);
  });

  test("a closed approval offers no decision", async ({ page }) => {
    await stub(page, "**/admin/approvals/approval-stub", {
      ...STUB_APPROVAL,
      status: "executed",
    });
    await page.goto("/approvals/approval-stub");

    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.getByRole("button", { name: "Approve" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Cancel the request" })).toHaveCount(0);
  });

  test("read-only staff sees no action they would be refused", async ({ page }) => {
    await page.unroute("**/admin/me");
    await stubMe(page, ["users.read", "orgs.read", "audit.read"]);

    await page.goto(USER_PATH);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    for (const name of ["Suspend", "Impersonate", "Revoke sessions", "Reset password"]) {
      await expect(page.getByRole("button", { name, exact: true })).toHaveCount(0);
    }

    await page.goto("/orgs/org-stub");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.getByRole("switch")).toHaveCount(0);
  });

  test("a team member without account search is not offered to add a person", async ({ page }) => {
    await page.unroute("**/admin/me");
    await stubMe(page, ["staff.manage"]);
    await page.goto("/team");

    await expect(page.getByRole("button", { name: "Manage" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Add a person" })).toHaveCount(0);
  });

  for (const path of [
    "/users",
    USER_PATH,
    "/orgs",
    "/orgs/org-stub",
    "/approvals",
    "/approvals/approval-stub",
    "/team",
    "/audit",
  ]) {
    test(`long values leave ${path} inside a 390 px screen`, async ({ page }) => {
      await page.setViewportSize({ width: 390, height: 844 });
      await page.goto(path);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      await page.waitForTimeout(300);

      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - window.innerWidth,
      );
      expect(overflow).toBeLessThanOrEqual(0);
    });
  }
});
