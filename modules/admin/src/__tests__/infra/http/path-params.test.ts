import { describe, expect, it } from "bun:test";
import { mockPort } from "@packages/test/bun";
import { z } from "zod";
import { adminApp, send } from "../../fixtures/http-app";
import type { AdminRoutesDeps } from "../../fixtures/mount-admin-routes";

const MALFORMED = "not.an.id";
const VALID = "u-2";
const FUTURE = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

function services() {
  return {
    IAuthProvider: mockPort<AdminRoutesDeps["IAuthProvider"]>(),
    IGetUserQuery: mockPort<AdminRoutesDeps["IGetUserQuery"]>(),
    IGetOrgQuery: mockPort<AdminRoutesDeps["IGetOrgQuery"]>(),
    IListStaffNotesQuery: mockPort<AdminRoutesDeps["IListStaffNotesQuery"]>(),
    AdminActionService: mockPort<AdminRoutesDeps["AdminActionService"]>(),
    IGetApprovalQuery: mockPort<AdminRoutesDeps["IGetApprovalQuery"]>(),
    DecideApprovalUseCase: mockPort<AdminRoutesDeps["DecideApprovalUseCase"]>(),
    CancelApprovalUseCase: mockPort<AdminRoutesDeps["CancelApprovalUseCase"]>(),
    IListStaffOverridesQuery: mockPort<AdminRoutesDeps["IListStaffOverridesQuery"]>(),
    BanUserUseCase: mockPort<AdminRoutesDeps["BanUserUseCase"]>(),
    UnbanUserUseCase: mockPort<AdminRoutesDeps["UnbanUserUseCase"]>(),
    ResetUserPasswordUseCase: mockPort<AdminRoutesDeps["ResetUserPasswordUseCase"]>(),
    RevokeUserSessionsUseCase: mockPort<AdminRoutesDeps["RevokeUserSessionsUseCase"]>(),
    AddStaffNoteUseCase: mockPort<AdminRoutesDeps["AddStaffNoteUseCase"]>(),
    ChangeStaffRoleUseCase: mockPort<AdminRoutesDeps["ChangeStaffRoleUseCase"]>(),
    RevokeStaffUseCase: mockPort<AdminRoutesDeps["RevokeStaffUseCase"]>(),
    SetStaffOverrideUseCase: mockPort<AdminRoutesDeps["SetStaffOverrideUseCase"]>(),
    RemoveStaffOverrideUseCase: mockPort<AdminRoutesDeps["RemoveStaffOverrideUseCase"]>(),
    DeleteViewUseCase: mockPort<AdminRoutesDeps["DeleteViewUseCase"]>(),
    SetPlanOverrideUseCase: mockPort<AdminRoutesDeps["SetPlanOverrideUseCase"]>(),
    RevokePlanOverrideUseCase: mockPort<AdminRoutesDeps["RevokePlanOverrideUseCase"]>(),
    ReplayStripeEventUseCase: mockPort<AdminRoutesDeps["ReplayStripeEventUseCase"]>(),
    StartImpersonationUseCase: mockPort<AdminRoutesDeps["StartImpersonationUseCase"]>(),
  };
}

type Services = ReturnType<typeof services>;

interface ParamCase {
  method: string;
  path: string;
  body?: unknown;
  field?: string;
  reached: (s: Services) => unknown[];
}

const CASES: ParamCase[] = [
  {
    method: "GET",
    path: `/admin/users/${MALFORMED}`,
    reached: (s) => [s.IGetUserQuery.execute],
  },
  {
    method: "POST",
    path: `/admin/users/${MALFORMED}/ban`,
    body: { reason: "abuse" },
    reached: (s) => [s.BanUserUseCase.execute],
  },
  {
    method: "POST",
    path: `/admin/users/${MALFORMED}/unban`,
    reached: (s) => [s.UnbanUserUseCase.execute],
  },
  {
    method: "POST",
    path: `/admin/users/${MALFORMED}/reset-password`,
    reached: (s) => [s.IGetUserQuery.execute, s.ResetUserPasswordUseCase.execute],
  },
  {
    method: "DELETE",
    path: `/admin/users/${MALFORMED}/sessions`,
    reached: (s) => [s.IGetUserQuery.execute, s.RevokeUserSessionsUseCase.execute],
  },
  {
    method: "GET",
    path: `/admin/users/${MALFORMED}/notes`,
    reached: (s) => [s.IListStaffNotesQuery.execute],
  },
  {
    method: "POST",
    path: `/admin/users/${MALFORMED}/notes`,
    body: { body: "note" },
    reached: (s) => [s.AddStaffNoteUseCase.execute],
  },
  {
    method: "PUT",
    path: `/admin/staff/${MALFORMED}/role`,
    body: { role: "support" },
    reached: (s) => [s.ChangeStaffRoleUseCase.execute],
  },
  {
    method: "DELETE",
    path: `/admin/staff/${MALFORMED}`,
    reached: (s) => [s.RevokeStaffUseCase.execute],
  },
  {
    method: "GET",
    path: `/admin/staff/${MALFORMED}/overrides`,
    reached: (s) => [s.IListStaffOverridesQuery.execute],
  },
  {
    method: "POST",
    path: `/admin/staff/${MALFORMED}/overrides`,
    body: { permission: "users.read", effect: "grant", expiresAt: null },
    reached: (s) => [s.SetStaffOverrideUseCase.execute],
  },
  {
    method: "DELETE",
    path: `/admin/staff/${MALFORMED}/overrides/override-1`,
    reached: (s) => [s.RemoveStaffOverrideUseCase.execute],
  },
  {
    method: "DELETE",
    path: `/admin/staff/${VALID}/overrides/${MALFORMED}`,
    field: "overrideId",
    reached: (s) => [s.RemoveStaffOverrideUseCase.execute],
  },
  {
    method: "DELETE",
    path: `/admin/views/${MALFORMED}`,
    reached: (s) => [s.DeleteViewUseCase.execute],
  },
  {
    method: "GET",
    path: `/admin/approvals/${MALFORMED}`,
    reached: (s) => [s.IGetApprovalQuery.execute],
  },
  {
    method: "POST",
    path: `/admin/approvals/${MALFORMED}/decide`,
    body: { decision: "approve", note: "ok" },
    reached: (s) => [s.DecideApprovalUseCase.execute],
  },
  {
    method: "POST",
    path: `/admin/approvals/${MALFORMED}/cancel`,
    reached: (s) => [s.CancelApprovalUseCase.execute],
  },
  { method: "GET", path: `/admin/orgs/${MALFORMED}`, reached: (s) => [s.IGetOrgQuery.execute] },
  {
    method: "POST",
    path: `/admin/orgs/${MALFORMED}/plan-override`,
    body: { tier: "pro", expiresAt: FUTURE, note: "deal" },
    reached: (s) => [s.SetPlanOverrideUseCase.execute],
  },
  {
    method: "DELETE",
    path: `/admin/orgs/${MALFORMED}/plan-override`,
    reached: (s) => [s.RevokePlanOverrideUseCase.execute],
  },
  {
    method: "GET",
    path: `/admin/orgs/${MALFORMED}/notes`,
    reached: (s) => [s.IListStaffNotesQuery.execute],
  },
  {
    method: "POST",
    path: `/admin/orgs/${MALFORMED}/notes`,
    body: { body: "note" },
    reached: (s) => [s.AddStaffNoteUseCase.execute],
  },
  {
    method: "POST",
    path: `/admin/orgs/${MALFORMED}/sso-enforcement`,
    body: { enforced: true },
    reached: (s) => [s.AdminActionService.setSsoEnforcement],
  },
  {
    method: "POST",
    path: `/admin/ops/stripe-events/${MALFORMED}/replay`,
    reached: (s) => [s.ReplayStripeEventUseCase.execute, s.IAuthProvider.handle],
  },
  {
    method: "POST",
    path: `/admin/impersonation/${MALFORMED}/start`,
    body: { reason: "support ticket" },
    reached: (s) => [s.StartImpersonationUseCase.execute, s.IAuthProvider.impersonateUser],
  },
];

const refusal = z.object({ error: z.object({ code: z.string(), message: z.string() }) });

describe("path params", () => {
  it.each(CASES.map((c) => [`${c.method} ${c.path}`, c] as const))(
    "%s refuses a malformed id with 400 and reaches no service",
    async (_name, { method, path, body, field = "id", reached }) => {
      const s = services();

      const res = await send(adminApp(s), method, path, body);

      expect(res.status).toBe(400);
      expect(refusal.parse(await res.json()).error).toEqual({
        code: "REQUEST_INVALID",
        message: `${field}: Not a valid id.`,
      });
      for (const call of reached(s)) expect(call).not.toHaveBeenCalled();
    },
  );
});
