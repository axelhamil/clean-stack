import { describe, expect, it, mock } from "bun:test";
import type { IOutboxRepository } from "@packages/outbox/outbox.port";
import { mockPort } from "@packages/test/bun";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import type { AuditLogRoutesDeps } from "../../audit-log/routes";

const realAuthMiddleware = await import("../../../shared/middleware/auth.middleware");
mock.module("../../../shared/middleware/auth.middleware", () => ({
  ...realAuthMiddleware,
  requireAuth: async (c: { set: (k: string, v: unknown) => void }, next: () => Promise<void>) => {
    c.set("user", { id: "u" });
    c.set("session", { impersonatedBy: null });
    await next();
  },
}));

const GATE_STATUS = 418;
mock.module("../../../shared/middleware/staff.middleware", () => ({
  requireStaff: async () => {
    throw new HTTPException(GATE_STATUS, { message: "staff" });
  },
  requireStaffPermission: (permission: string) => async () => {
    throw new HTTPException(GATE_STATUS, { message: permission });
  },
  requireStepUp: async (_c: unknown, next: () => Promise<void>) => next(),
  assertStepUp: async () => {},
}));

const { adminApprovalRoutes } = await import("../approvals.routes");
const { adminImpersonationRoutes } = await import("../admin-impersonation.routes");
const { adminOpsRoutes } = await import("../ops.routes");
const { adminOrgRoutes } = await import("../admin-orgs.routes");
const { adminUserRoutes } = await import("../routes");
const { adminStaffRoutes } = await import("../staff.routes");
const { adminWorkspaceRoutes } = await import("../workspace.routes");
const { createAuditLogRoutes } = await import("../../audit-log/routes");
const { routeGuards } = await import("../../../composition/route-guards");
const { listBackRoutes } = await import("../../../shared/surface/back-routes");

const app = new Hono()
  .route("/admin", adminStaffRoutes)
  .route("/admin", adminWorkspaceRoutes)
  .route("/admin/approvals", adminApprovalRoutes)
  .route("/admin/users", adminUserRoutes)
  .route("/admin/orgs", adminOrgRoutes)
  .route("/admin/ops", adminOpsRoutes)
  .route("/admin/impersonation", adminImpersonationRoutes)
  .route(
    "/admin/audit-log",
    createAuditLogRoutes({
      routeGuards,
      IOutboxRepository: mockPort<IOutboxRepository>(),
      AuditQueryService: mockPort<AuditLogRoutesDeps["AuditQueryService"]>(),
    }),
  );
app.onError((err, c) =>
  c.text(err instanceof HTTPException ? err.message : "unguarded", GATE_STATUS),
);

const REQUIRED: Record<string, string> = {
  "GET /admin/me": "staff",
  "POST /admin/step-up": "staff",
  "GET /admin/inbox": "staff",
  "GET /admin/views": "staff",
  "POST /admin/views": "staff",
  "DELETE /admin/views/:id": "staff",
  "GET /admin/staff": "staff.manage",
  "PUT /admin/staff/:id/role": "staff.manage",
  "DELETE /admin/staff/:id": "staff.manage",
  "GET /admin/staff/:id/overrides": "staff.manage",
  "POST /admin/staff/:id/overrides": "staff.manage",
  "DELETE /admin/staff/:id/overrides/:overrideId": "staff.manage",
  "GET /admin/approvals": "approvals.decide",
  "GET /admin/approvals/:id": "approvals.decide",
  "POST /admin/approvals/:id/decide": "approvals.decide",
  "POST /admin/approvals/:id/cancel": "staff",
  "GET /admin/users": "users.read",
  "GET /admin/users/:id": "users.read",
  "GET /admin/users/:id/notes": "users.read",
  "POST /admin/users/:id/notes": "notes.write",
  "POST /admin/users/:id/ban": "users.moderate",
  "POST /admin/users/:id/unban": "users.moderate",
  "POST /admin/users/:id/reset-password": "users.moderate",
  "DELETE /admin/users/:id/sessions": "users.moderate",
  "POST /admin/impersonation/:id/start": "users.impersonate",
  "GET /admin/orgs": "orgs.read",
  "GET /admin/orgs/:id": "orgs.read",
  "POST /admin/orgs/:id/sso-enforcement": "orgs.sso",
  "POST /admin/orgs/:id/plan-override": "billing.override",
  "DELETE /admin/orgs/:id/plan-override": "billing.override",
  "GET /admin/orgs/:id/notes": "orgs.read",
  "POST /admin/orgs/:id/notes": "notes.write",
  "GET /admin/ops/dead-letters": "ops.read",
  "POST /admin/ops/outbox/requeue": "ops.manage",
  "GET /admin/ops/sweeps": "ops.read",
  "GET /admin/ops/stripe-events": "ops.read",
  "POST /admin/ops/stripe-events/:id/replay": "ops.manage",
  "GET /admin/audit-log": "audit.read",
  "GET /admin/audit-log/verify": "audit.read",
};

const IMPERSONATED_SESSION_ONLY = "POST /admin/impersonation/stop";

describe("staff permission of each admin route", () => {
  for (const [route, permission] of Object.entries(REQUIRED)) {
    it(`${route} asks for ${permission}`, async () => {
      const [method = "", path = ""] = route.split(" ");

      const res = await app.request(path.replaceAll(":id", "x"), { method });

      expect(await res.text()).toBe(permission);
    });
  }

  it("leaves no admin route out of the table", () => {
    const adminRoutes = listBackRoutes().filter((route) => route.includes(" /admin/"));
    const uncovered = adminRoutes.filter(
      (route) => !(route in REQUIRED) && route !== IMPERSONATED_SESSION_ONLY,
    );

    expect(uncovered).toEqual([]);
  });
});
