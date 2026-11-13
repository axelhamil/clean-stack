import { beforeEach, describe, expect, it } from "bun:test";
import { Option, Result } from "@packages/ddd-kit";
import { mockPort } from "@packages/test/bun";
import type { ApprovalService } from "../../../application/services/approval.service";
import type { StaffService } from "../../../application/services/staff.service";
import { ChangeStaffRoleUseCase } from "../../../application/usecases/change-staff-role/change-staff-role.usecase";
import { RemoveStaffOverrideUseCase } from "../../../application/usecases/remove-staff-override/remove-staff-override.usecase";
import { RevokeStaffUseCase } from "../../../application/usecases/revoke-staff/revoke-staff.usecase";
import { SetStaffOverrideUseCase } from "../../../application/usecases/set-staff-override/set-staff-override.usecase";
import { ACTOR_ID, adminApp, errorCodeOf, MANAGER, send } from "../../fixtures/http-app";
import type { AdminRoutesDeps } from "../../fixtures/mount-admin-routes";

const CREATED = new Date("2026-01-02T03:04:05.000Z");
const FUTURE = "2099-01-01T00:00:00.000Z";

type StaffWrites =
  | "list"
  | "listOverrides"
  | "assignRole"
  | "revoke"
  | "setOverride"
  | "removeOverride";

let validity = mockPort<AdminRoutesDeps["IStepUpValidityQuery"]>();
let verify = mockPort<AdminRoutesDeps["VerifyStepUpUseCase"]>();
let approvals = mockPort<Pick<ApprovalService, "gate">>();
let staff = mockPort<Pick<StaffService, StaffWrites>>();

beforeEach(() => {
  validity = mockPort<AdminRoutesDeps["IStepUpValidityQuery"]>();
  verify = mockPort<AdminRoutesDeps["VerifyStepUpUseCase"]>();
  approvals = mockPort<Pick<ApprovalService, "gate">>();
  staff = mockPort<Pick<StaffService, StaffWrites>>();
  approvals.gate.mockResolvedValue(Result.ok(Option.none()));
  staff.assignRole.mockResolvedValue(Result.ok());
  staff.revoke.mockResolvedValue(Result.ok());
  staff.setOverride.mockResolvedValue(Result.ok());
  staff.removeOverride.mockResolvedValue(Result.ok());
});

const app = () =>
  adminApp({
    IStepUpValidityQuery: validity,
    VerifyStepUpUseCase: verify,
    StaffService: staff,
    ChangeStaffRoleUseCase: new ChangeStaffRoleUseCase(approvals, staff),
    RevokeStaffUseCase: new RevokeStaffUseCase(approvals, staff),
    SetStaffOverrideUseCase: new SetStaffOverrideUseCase(approvals, staff),
    RemoveStaffOverrideUseCase: new RemoveStaffOverrideUseCase(approvals, staff),
    staffSettings: { PLATFORM_ADMIN_REQUIRE_MFA: true },
  });

describe("GET /admin/me", () => {
  it("describes the staff member, the live step-up and the MFA policy", async () => {
    validity.execute.mockResolvedValue(Result.ok(Option.some(CREATED)));

    const res = await send(app(), "GET", "/admin/me");

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      id: ACTOR_ID,
      email: `${ACTOR_ID}@example.com`,
      role: "manager",
      permissions: MANAGER.permissions,
      mfa: true,
      stepUpValidUntil: CREATED.toISOString(),
      policy: { requireMfa: true },
    });
    expect(validity.execute).toHaveBeenCalledWith({ sessionId: "session-1" });
  });
});

describe("POST /admin/step-up", () => {
  it("verifies the code for the current session and returns the expiry", async () => {
    verify.execute.mockResolvedValue(Result.ok({ validUntil: CREATED }));

    const res = await send(app(), "POST", "/admin/step-up", { code: " 123456 " });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ validUntil: CREATED.toISOString() });
    expect(verify.execute).toHaveBeenCalledWith({
      userId: ACTOR_ID,
      sessionId: "session-1",
      code: "123456",
      ip: "198.51.100.7",
    });
  });

  it("refuses a code that is not six digits", async () => {
    const res = await send(app(), "POST", "/admin/step-up", { code: "12ab56" });

    expect(res.status).toBe(400);
    expect(verify.execute).not.toHaveBeenCalled();
  });

  it("surfaces a refused code", async () => {
    verify.execute.mockResolvedValue(
      Result.fail({ code: "ADMIN_STEP_UP_MFA_FORBIDDEN", message: "bad code" }),
    );

    const res = await send(app(), "POST", "/admin/step-up", { code: "123456" });

    expect(res.status).toBe(403);
    expect(await errorCodeOf(res)).toBe("ADMIN_STEP_UP_MFA_FORBIDDEN");
  });
});

describe("GET /admin/staff", () => {
  it("lists staff with ISO dates", async () => {
    staff.list.mockResolvedValue(
      Result.ok([
        {
          userId: "u-1",
          email: "u-1@example.com",
          name: "U",
          role: "support",
          source: "console",
          createdAt: CREATED,
        },
      ]),
    );

    const res = await send(app(), "GET", "/admin/staff");

    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      items: [{ userId: "u-1", createdAt: CREATED.toISOString() }],
    });
  });
});

describe("PUT /admin/staff/:id/role", () => {
  it("assigns the role at once when no approval is required", async () => {
    const res = await send(app(), "PUT", "/admin/staff/u-2/role", { role: "support" });

    expect(res.status).toBe(200);
    expect(staff.assignRole).toHaveBeenCalledWith({
      actorUserId: ACTOR_ID,
      actorPermissions: MANAGER.permissions,
      targetUserId: "u-2",
      role: "support",
    });
  });

  it("answers 202 and changes nothing when the change waits for a second pair of eyes", async () => {
    approvals.gate.mockResolvedValue(Result.ok(Option.some("approval-1")));

    const res = await send(app(), "PUT", "/admin/staff/u-2/role", { role: "support" });

    expect(res.status).toBe(202);
    expect(await res.json()).toEqual({ approvalId: "approval-1" });
    expect(approvals.gate).toHaveBeenCalledWith({
      action: "staff.role_change",
      subjectId: "u-2",
      params: { role: "support" },
      requestedBy: ACTOR_ID,
      requesterPermissions: MANAGER.permissions,
    });
    expect(staff.assignRole).not.toHaveBeenCalled();
  });

  it("refuses an unknown role", async () => {
    const res = await send(app(), "PUT", "/admin/staff/u-2/role", { role: "god" });

    expect(res.status).toBe(400);
    expect(approvals.gate).not.toHaveBeenCalled();
  });

  it("surfaces a refusal of the last manager rule", async () => {
    staff.assignRole.mockResolvedValue(
      Result.fail({ code: "ADMIN_STAFF_LAST_MANAGER_FORBIDDEN", message: "last" }),
    );

    const res = await send(app(), "PUT", "/admin/staff/u-2/role", { role: "support" });

    expect(res.status).toBe(403);
    expect(await errorCodeOf(res)).toBe("ADMIN_STAFF_LAST_MANAGER_FORBIDDEN");
  });
});

describe("DELETE /admin/staff/:id", () => {
  it("revokes at once when no approval is required", async () => {
    const res = await send(app(), "DELETE", "/admin/staff/u-2");

    expect(res.status).toBe(200);
    expect(staff.revoke).toHaveBeenCalledWith({ actorUserId: ACTOR_ID, targetUserId: "u-2" });
  });

  it("answers 202 and revokes nobody while the request waits", async () => {
    approvals.gate.mockResolvedValue(Result.ok(Option.some("approval-2")));

    const res = await send(app(), "DELETE", "/admin/staff/u-2");

    expect(res.status).toBe(202);
    expect(approvals.gate).toHaveBeenCalledWith(
      expect.objectContaining({ action: "staff.revoke", subjectId: "u-2", params: {} }),
    );
    expect(staff.revoke).not.toHaveBeenCalled();
  });
});

describe("staff overrides", () => {
  it("lists the overrides with null for no expiry", async () => {
    staff.listOverrides.mockResolvedValue(
      Result.ok([
        {
          id: "o-1",
          permission: "users.read",
          effect: "grant",
          expiresAt: Option.none(),
          createdAt: CREATED,
        },
      ]),
    );

    const res = await send(app(), "GET", "/admin/staff/u-2/overrides");

    expect(res.status).toBe(200);
    expect(staff.listOverrides).toHaveBeenCalledWith("u-2");
    expect(await res.json()).toEqual({
      items: [
        {
          id: "o-1",
          permission: "users.read",
          effect: "grant",
          expiresAt: null,
          createdAt: CREATED.toISOString(),
        },
      ],
    });
  });

  it("sets an override with its expiry as a date when no approval is required", async () => {
    const res = await send(app(), "POST", "/admin/staff/u-2/overrides", {
      permission: "users.read",
      effect: "deny",
      expiresAt: FUTURE,
    });

    expect(res.status).toBe(200);
    expect(approvals.gate).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "staff.permission_override",
        params: { op: "set", permission: "users.read", effect: "deny", expiresAt: FUTURE },
      }),
    );
    expect(staff.setOverride).toHaveBeenCalledWith({
      actorUserId: ACTOR_ID,
      actorPermissions: MANAGER.permissions,
      targetUserId: "u-2",
      permission: "users.read",
      effect: "deny",
      expiresAt: Option.some(new Date(FUTURE)),
    });
  });

  it("refuses an override that already expired", async () => {
    const res = await send(app(), "POST", "/admin/staff/u-2/overrides", {
      permission: "users.read",
      effect: "grant",
      expiresAt: "2000-01-01T00:00:00.000Z",
    });

    expect(res.status).toBe(400);
    expect(staff.setOverride).not.toHaveBeenCalled();
  });

  it("answers 202 and sets nothing while the override waits", async () => {
    approvals.gate.mockResolvedValue(Result.ok(Option.some("approval-3")));

    const res = await send(app(), "POST", "/admin/staff/u-2/overrides", {
      permission: "users.read",
      effect: "grant",
      expiresAt: null,
    });

    expect(res.status).toBe(202);
    expect(staff.setOverride).not.toHaveBeenCalled();
  });

  it("removes an override when no approval is required", async () => {
    const res = await send(app(), "DELETE", "/admin/staff/u-2/overrides/o-1");

    expect(res.status).toBe(200);
    expect(approvals.gate).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "staff.permission_override",
        subjectId: "u-2",
        params: { op: "revoke", overrideId: "o-1" },
      }),
    );
    expect(staff.removeOverride).toHaveBeenCalledWith({
      actorUserId: ACTOR_ID,
      actorPermissions: MANAGER.permissions,
      targetUserId: "u-2",
      overrideId: "o-1",
    });
  });

  it("answers 202 and removes nothing while the removal waits", async () => {
    approvals.gate.mockResolvedValue(Result.ok(Option.some("approval-4")));

    const res = await send(app(), "DELETE", "/admin/staff/u-2/overrides/o-1");

    expect(res.status).toBe(202);
    expect(staff.removeOverride).not.toHaveBeenCalled();
  });
});
