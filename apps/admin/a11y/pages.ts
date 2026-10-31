import { type AuditedPage, corsHeaders } from "@packages/test/a11y";
import type { Page } from "@playwright/test";
import {
  STUB_APPROVAL,
  STUB_DEAD_LETTERS,
  STUB_INBOX,
  STUB_MEMBERS,
  STUB_NOTES,
  STUB_ORG,
  STUB_STRIPE_EVENTS,
  STUB_SWEEPS,
  STUB_VIEWS,
} from "./stubs";

function stubApi(path: string, json: unknown, status = 200) {
  return async (page: Page): Promise<void> => {
    await page.route(path, (route) =>
      route.fulfill({ status, json, headers: corsHeaders(route.request().headers().origin) }),
    );
  };
}

export const PUBLIC_PAGES: readonly AuditedPage[] = [{ name: "denied", path: "/denied" }];

export const STAFF_PAGES: readonly AuditedPage[] = [
  { name: "home", path: "/" },
  { name: "home, full inbox", path: "/", prepare: stubApi("**/admin/inbox", STUB_INBOX) },
  {
    name: "home, quiet inbox",
    path: "/",
    prepare: stubApi("**/admin/inbox", {
      approvals: { total: 0, items: [] },
      operations: { deadEvents: 0, deadEmails: 0, deadWebhooks: 0, failedSweeps: [] },
    }),
  },
  {
    name: "home, load error",
    path: "/",
    prepare: stubApi("**/admin/inbox", { error: { code: "X", message: "x" } }, 500),
  },
  {
    name: "accounts, saved views",
    path: "/users",
    prepare: stubApi("**/admin/views", STUB_VIEWS),
  },
  { name: "accounts", path: "/users" },
  {
    name: "accounts, no match",
    path: "/users",
    prepare: stubApi("**/admin/users?*", { items: [], nextCursor: null }),
  },
  {
    name: "accounts, load error",
    path: "/users",
    prepare: stubApi("**/admin/users?*", { error: { code: "X", message: "x" } }, 500),
  },
  { name: "account detail", path: "/users/seed-staff-auditor" },
  { name: "organizations", path: "/orgs" },
  {
    name: "organization detail",
    path: "/orgs/org-stub",
    prepare: async (page) => {
      await stubApi("**/admin/orgs/org-stub", STUB_ORG)(page);
      await stubApi("**/admin/orgs/org-stub/notes", STUB_NOTES)(page);
    },
  },
  {
    name: "organization detail, no override and no note",
    path: "/orgs/org-stub",
    prepare: async (page) => {
      await stubApi("**/admin/orgs/org-stub", { ...STUB_ORG, plan: "free", planOverride: null })(
        page,
      );
      await stubApi("**/admin/orgs/org-stub/notes", { items: [] })(page);
    },
  },
  {
    name: "organization detail, notes load error",
    path: "/orgs/org-stub",
    prepare: async (page) => {
      await stubApi("**/admin/orgs/org-stub", STUB_ORG)(page);
      await stubApi(
        "**/admin/orgs/org-stub/notes",
        { error: { code: "X", message: "x" } },
        500,
      )(page);
    },
  },
  { name: "audit log", path: "/audit" },
  { name: "operations", path: "/operations" },
  {
    name: "operations, full",
    path: "/operations",
    prepare: async (page) => {
      await stubApi("**/admin/ops/dead-letters", STUB_DEAD_LETTERS)(page);
      await stubApi("**/admin/ops/sweeps", STUB_SWEEPS)(page);
      await stubApi("**/admin/ops/stripe-events", STUB_STRIPE_EVENTS)(page);
    },
  },
  {
    name: "operations, load error",
    path: "/operations",
    prepare: async (page) => {
      const refused = { error: { code: "X", message: "x" } };
      await stubApi("**/admin/ops/dead-letters", refused, 500)(page);
      await stubApi("**/admin/ops/sweeps", refused, 500)(page);
      await stubApi("**/admin/ops/stripe-events", refused, 500)(page);
    },
  },
  { name: "approvals", path: "/approvals" },
  {
    name: "approval detail",
    path: "/approvals/approval-stub",
    prepare: stubApi("**/admin/approvals/approval-stub", STUB_APPROVAL),
  },
  { name: "team", path: "/team" },
  {
    name: "team, empty",
    path: "/team",
    prepare: stubApi("**/admin/staff", { items: [] }),
  },
  {
    name: "team, long values",
    path: "/team",
    prepare: stubApi("**/admin/staff", { items: STUB_MEMBERS }),
  },
  { name: "not found", path: "/no-such-section" },
];
