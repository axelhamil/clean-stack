import { type AuditedPage, corsHeaders } from "@packages/test/a11y";
import type { Page } from "@playwright/test";
import {
  STUB_APPROVAL,
  STUB_DEAD_LETTERS,
  STUB_MEMBERS,
  STUB_ORG,
  STUB_STRIPE_EVENTS,
  STUB_SWEEPS,
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
    prepare: stubApi("**/admin/orgs/org-stub", STUB_ORG),
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
