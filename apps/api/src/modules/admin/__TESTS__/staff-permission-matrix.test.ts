import { describe, expect, it, mock } from "bun:test";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";

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
const { adminOrgRoutes } = await import("../admin-orgs.routes");
const { adminUserRoutes } = await import("../routes");
const { adminStaffRoutes } = await import("../staff.routes");
const { auditLogRoutes } = await import("../../audit-log/routes");
const { listBackRoutes } = await import("../../../shared/surface/back-routes");

const app = new Hono()
  .route("/admin", adminStaffRoutes)
  .route("/admin/approvals", adminApprovalRoutes)
  .route("/admin/users", adminUserRoutes)
  .route("/admin/orgs", adminOrgRoutes)
  .route("/admin/impersonation", adminImpersonationRoutes)
  .route("/admin/audit-log", auditLogRoutes);
app.onError((err, c) =>
  c.text(err instanceof HTTPException ? err.message : "unguarded", GATE_STATUS),
);

const REQUIRED: Record<string, string> = {
  "GET /admin/me": "staff",
  "POST /admin/step-up": "staff",
  "GET /admin/staff": "staff.manage",
  "PUT /admin/staff/:id/role": "staff.manage",
  "DELETE /admin/staff/:id": "staff.manage",
  "GET /admin/approvals": "approvals.decide",
  "GET /admin/approvals/:id": "approvals.decide",
  "POST /admin/approvals/:id/decide": "approvals.decide",
  "POST /admin/approvals/:id/cancel": "staff",
  "GET /admin/users": "users.read",
  "GET /admin/users/:id": "users.read",
  "POST /admin/users/:id/ban": "users.moderate",
  "POST /admin/users/:id/unban": "users.moderate",
  "POST /admin/users/:id/reset-password": "users.moderate",
  "DELETE /admin/users/:id/sessions": "users.moderate",
  "POST /admin/impersonation/:id/start": "users.impersonate",
  "GET /admin/orgs": "orgs.read",
  "GET /admin/orgs/:id": "orgs.read",
  "POST /admin/orgs/:id/sso-enforcement": "orgs.sso",
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
