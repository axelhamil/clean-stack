import type { AuditedPage } from "@packages/test/a11y";

export const PUBLIC_PAGES: readonly AuditedPage[] = [{ name: "denied", path: "/denied" }];

export const STAFF_PAGES: readonly AuditedPage[] = [
  { name: "home", path: "/" },
  { name: "accounts section", path: "/users" },
  { name: "organizations section", path: "/orgs" },
  { name: "audit section", path: "/audit" },
  { name: "operations section", path: "/operations" },
  { name: "approvals section", path: "/approvals" },
  { name: "team section", path: "/team" },
  { name: "not found", path: "/no-such-section" },
];
