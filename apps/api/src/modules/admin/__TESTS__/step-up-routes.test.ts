import { describe, expect, it, mock } from "bun:test";
import { Option, Result } from "@packages/ddd-kit";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";

const realAuthMiddleware = await import("../../../shared/middleware/auth.middleware");
mock.module("../../../shared/middleware/auth.middleware", () => ({
  ...realAuthMiddleware,
  requireAuth: async (c: { set: (k: string, v: unknown) => void }, next: () => Promise<void>) => {
    c.set("user", { id: "actor", twoFactorEnabled: true });
    c.set("session", { id: "s1", impersonatedBy: null });
    c.set("staff", { role: "manager", permissions: [], mfaOk: true });
    await next();
  },
}));

const STEP_UP_STATUS = 418;
const refuseStepUp = () => {
  throw new HTTPException(STEP_UP_STATUS, { message: "step-up" });
};
mock.module("../../../shared/middleware/staff.middleware", () => ({
  requireStaff: async (_c: unknown, next: () => Promise<void>) => next(),
  requireStaffPermission: () => async (_c: unknown, next: () => Promise<void>) => next(),
  requireStepUp: async () => refuseStepUp(),
  assertStepUp: async () => refuseStepUp(),
}));

const allowed = async () => Result.ok();
mock.module("../../../container", () => ({
  di: {
    IOutboxRepository: {},
    ITransactionService: { run: async (work: () => Promise<unknown>) => work() },
    IInstrumentation: {
      startSpan: (_o: unknown, work: () => unknown) => work(),
      capture: () => {},
    },
    StaffService: {
      moderateBan: async () => Result.ok(),
      assignRole: allowed,
      revoke: allowed,
    },
    AdminModerationService: { ban: allowed },
    StepUpService: { validUntil: async () => Result.ok(Option.none()) },
  },
}));

const realAuthQueries = await import("../../../auth-queries");
mock.module("../../../auth-queries", () => ({
  ...realAuthQueries,
  setOrgSsoEnforced: async () => {},
}));

const { adminApprovalRoutes } = await import("../approvals.routes");
const { adminImpersonationRoutes } = await import("../admin-impersonation.routes");
const { adminOrgRoutes } = await import("../admin-orgs.routes");
const { adminUserRoutes } = await import("../routes");
const { adminStaffRoutes } = await import("../staff.routes");

const app = new Hono()
  .route("/admin", adminStaffRoutes)
  .route("/admin/approvals", adminApprovalRoutes)
  .route("/admin/users", adminUserRoutes)
  .route("/admin/orgs", adminOrgRoutes)
  .route("/admin/impersonation", adminImpersonationRoutes);
app.onError((err, c) =>
  err instanceof HTTPException ? c.text(err.message, STEP_UP_STATUS) : c.text(String(err), 500),
);

function send(method: string, path: string, body?: unknown) {
  return app.request(path, {
    method,
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

const GATED: [string, string, string, unknown][] = [
  ["a permanent ban", "POST", "/admin/users/x/ban", { reason: "spam" }],
  ["a role change", "PUT", "/admin/staff/x/role", { role: "support" }],
  ["a staff revocation", "DELETE", "/admin/staff/x", undefined],
  ["an impersonation start", "POST", "/admin/impersonation/x/start", { reason: "ticket 42" }],
  ["SSO enforcement off", "POST", "/admin/orgs/x/sso-enforcement", { enforced: false }],
  ["an approval decision", "POST", "/admin/approvals/x/decide", { decision: "reject", note: "no" }],
];

const OPEN: [string, string, string, unknown][] = [
  ["a temporary ban", "POST", "/admin/users/x/ban", { reason: "spam", expiresIn: 3600 }],
  ["SSO enforcement on", "POST", "/admin/orgs/x/sso-enforcement", { enforced: true }],
];

describe("step-up on sensitive admin routes", () => {
  for (const [name, method, path, body] of GATED) {
    it(`${name} asks for a step-up`, async () => {
      const res = await send(method, path, body);

      expect(res.status).toBe(STEP_UP_STATUS);
    });
  }

  for (const [name, method, path, body] of OPEN) {
    it(`${name} does not`, async () => {
      const res = await send(method, path, body);

      expect(res.status).not.toBe(STEP_UP_STATUS);
    });
  }
});
