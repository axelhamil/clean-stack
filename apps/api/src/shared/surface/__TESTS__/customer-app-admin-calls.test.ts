import { describe, expect, it } from "bun:test";
import { APP_SRC, listFrontConsumers } from "../front-consumers";

// The customer app may end up calling only impersonation.stop. Every other entry is a screen
// still to move to apps/admin: remove it with its call, this list only ever shrinks.
const ALLOWED_ADMIN_CALLS = [
  "DELETE /admin/users/:id/sessions",
  "GET /admin/audit-log",
  "GET /admin/audit-log/verify",
  "GET /admin/orgs",
  "GET /admin/orgs/:id",
  "GET /admin/users",
  "GET /admin/users/:id",
  "POST /admin/impersonation/:id/start",
  "POST /admin/impersonation/stop",
  "POST /admin/orgs/:id/sso-enforcement",
  "POST /admin/step-up",
  "POST /admin/users/:id/ban",
  "POST /admin/users/:id/reset-password",
  "POST /admin/users/:id/unban",
];

describe("admin calls from the customer app", () => {
  it("match the shrinking allowlist exactly", () => {
    const calls = listFrontConsumers([APP_SRC])
      .map((consumer) => consumer.route)
      .filter((route) => route.split(" ")[1]?.startsWith("/admin/"));

    expect([...new Set(calls)].sort()).toEqual([...ALLOWED_ADMIN_CALLS].sort());
  });
});
