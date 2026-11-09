import { describe, expect, it } from "bun:test";
import { Option, Result } from "@packages/ddd-kit";
import type { RouteGuard } from "@packages/http/route-guards";
import { openRouteGuards } from "@packages/http/testing/route-guards";
import { mockPort } from "@packages/test/bun";
import { HTTPException } from "hono/http-exception";
import { type AdminRoutesDeps, mountAdminRoutes } from "../testing/mount-admin-routes";

const STEP_UP_STATUS = 418;
const refuseStepUp = () => {
  throw new HTTPException(STEP_UP_STATUS, { message: "step-up" });
};
const refusingStepUp: RouteGuard = async () => refuseStepUp();

const allowed = async () => Result.ok<never>();
const app = mountAdminRoutes(
  {
    ...openRouteGuards({
      userId: "actor",
      staff: { role: "manager", permissions: [], mfaOk: true },
    }),
    requireStepUp: refusingStepUp,
    assertStepUp: async () => refuseStepUp(),
  },
  {
    AdminActionService: { setSsoEnforcement: allowed },
    StaffService: {
      ...mockPort<AdminRoutesDeps["StaffService"]>(),
      moderateBan: async () => Result.ok(),
      banIsSensitive: async (input: { targetUserId: string; expiresIn?: number }) =>
        Result.ok(input.expiresIn === undefined || input.targetUserId === "staff-target"),
      assignRole: allowed,
      revoke: allowed,
    },
    AdminModerationService: {
      ...mockPort<AdminRoutesDeps["AdminModerationService"]>(),
      ban: allowed,
    },
    StepUpService: {
      ...mockPort<AdminRoutesDeps["StepUpService"]>(),
      validUntil: async () => Result.ok(Option.none()),
    },
  },
);
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
  [
    "a timed ban of a staff member",
    "POST",
    "/admin/users/staff-target/ban",
    { reason: "spam", expiresIn: 3600 },
  ],
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
