import { beforeEach, describe, expect, it } from "bun:test";
import { Option, Result } from "@packages/ddd-kit";
import { mockPort } from "@packages/test/bun";
import type { AdminUserDetail } from "../../../application/services/admin-query.service";
import { ACTOR_ID, adminApp, errorCodeOf, MANAGER, send } from "../../fixtures/http-app";
import type { AdminRoutesDeps } from "../../fixtures/mount-admin-routes";

const CREATED = new Date("2026-01-02T03:04:05.000Z");

const USER: AdminUserDetail = {
  id: "user-2",
  email: "user-2@example.com",
  name: "User Two",
  banned: true,
  banReason: Option.some("spam"),
  banExpires: Option.none(),
  twoFactorEnabled: false,
  createdAt: CREATED,
  sessions: [
    {
      id: "s-1",
      createdAt: CREATED,
      expiresAt: CREATED,
      ipAddress: Option.none(),
      userAgent: Option.some("curl"),
      impersonatedBy: Option.none(),
    },
  ],
  memberships: [{ organizationId: "org-1", organizationName: "Acme", role: "owner" }],
};

let queries = mockPort<AdminRoutesDeps["AdminQueryService"]>();
let moderation = mockPort<AdminRoutesDeps["AdminModerationService"]>();
let approvals = mockPort<AdminRoutesDeps["ApprovalService"]>();
let staff = mockPort<AdminRoutesDeps["StaffService"]>();
let notes = mockPort<AdminRoutesDeps["StaffNoteService"]>();
let auth = mockPort<AdminRoutesDeps["IAuthProvider"]>();

beforeEach(() => {
  queries = mockPort<AdminRoutesDeps["AdminQueryService"]>();
  moderation = mockPort<AdminRoutesDeps["AdminModerationService"]>();
  approvals = mockPort<AdminRoutesDeps["ApprovalService"]>();
  staff = mockPort<AdminRoutesDeps["StaffService"]>();
  notes = mockPort<AdminRoutesDeps["StaffNoteService"]>();
  auth = mockPort<AdminRoutesDeps["IAuthProvider"]>();
  queries.getUser.mockResolvedValue(Result.ok(Option.some(USER)));
  staff.moderate.mockImplementation(async (_change, run) => run());
  staff.moderateBan.mockImplementation(async (_change, run) => run());
  staff.banIsSensitive.mockResolvedValue(Result.ok(false));
  moderation.ban.mockResolvedValue(Result.ok());
  moderation.unban.mockResolvedValue(Result.ok());
  moderation.revokeSessions.mockResolvedValue(Result.ok());
  moderation.resetPassword.mockImplementation(async (_input, deliver) => deliver());
  auth.requestPasswordReset.mockResolvedValue(Result.ok());
});

const app = () =>
  adminApp({
    AdminQueryService: queries,
    AdminModerationService: moderation,
    ApprovalService: approvals,
    StaffService: staff,
    StaffNoteService: notes,
    IAuthProvider: auth,
  });

describe("GET /admin/users", () => {
  it("lists users with dates as ISO strings and absent values as null", async () => {
    queries.listUsers.mockResolvedValue(
      Result.ok({
        items: [{ ...USER, cursorAt: "2026-01-02 03:04:05" }],
        nextCursor: Option.some("next"),
      }),
    );

    const res = await send(app(), "GET", "/admin/users?limit=1");

    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      nextCursor: "next",
      items: [
        {
          id: "user-2",
          banReason: "spam",
          banExpires: null,
          createdAt: CREATED.toISOString(),
        },
      ],
    });
  });

  it("refuses a malformed cursor", async () => {
    const res = await send(app(), "GET", "/admin/users?cursor=nope");

    expect(res.status).toBe(400);
    expect(queries.listUsers).not.toHaveBeenCalled();
  });
});

describe("GET /admin/users/:id", () => {
  it("answers 404 for an unknown user", async () => {
    queries.getUser.mockResolvedValue(Result.ok(Option.none()));

    const res = await send(app(), "GET", "/admin/users/ghost");

    expect(res.status).toBe(404);
  });

  it("returns the user with sessions and memberships", async () => {
    const res = await send(app(), "GET", "/admin/users/user-2");

    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      memberships: USER.memberships,
      sessions: [
        {
          id: "s-1",
          createdAt: CREATED.toISOString(),
          expiresAt: CREATED.toISOString(),
          ipAddress: null,
          userAgent: "curl",
          impersonatedBy: null,
        },
      ],
    });
  });
});

describe("POST /admin/users/:id/ban", () => {
  it("bans at once when the ban is not sensitive, without asking for an approval", async () => {
    const res = await send(app(), "POST", "/admin/users/user-2/ban", {
      reason: "spam",
      expiresIn: 3600,
    });

    expect(res.status).toBe(200);
    expect(approvals.gate).not.toHaveBeenCalled();
    expect(moderation.ban).toHaveBeenCalledWith({
      actorUserId: ACTOR_ID,
      userId: "user-2",
      reason: "spam",
      expiresIn: 3600,
    });
  });

  it("answers 202 with the approval id and bans nobody when a sensitive ban needs four eyes", async () => {
    staff.banIsSensitive.mockResolvedValue(Result.ok(true));
    approvals.gate.mockResolvedValue(Result.ok(Option.some("approval-9")));

    const res = await send(app(), "POST", "/admin/users/user-2/ban", { reason: "spam" });

    expect(res.status).toBe(202);
    expect(await res.json()).toEqual({ approvalId: "approval-9" });
    expect(approvals.gate).toHaveBeenCalledWith({
      action: "user.ban_permanent",
      subjectId: "user-2",
      params: { reason: "spam" },
      requestedBy: ACTOR_ID,
      requesterPermissions: MANAGER.permissions,
    });
    expect(moderation.ban).not.toHaveBeenCalled();
  });

  it("bans at once when a sensitive ban needs no approval", async () => {
    staff.banIsSensitive.mockResolvedValue(Result.ok(true));
    approvals.gate.mockResolvedValue(Result.ok(Option.none()));

    const res = await send(app(), "POST", "/admin/users/user-2/ban", { reason: "spam" });

    expect(res.status).toBe(200);
    expect(moderation.ban).toHaveBeenCalled();
  });

  it("surfaces a refused approval request and bans nobody", async () => {
    staff.banIsSensitive.mockResolvedValue(Result.ok(true));
    approvals.gate.mockResolvedValue(
      Result.fail({ code: "ADMIN_APPROVAL_ALREADY_PENDING_CONFLICT", message: "pending" }),
    );

    const res = await send(app(), "POST", "/admin/users/user-2/ban", { reason: "spam" });

    expect(res.status).toBe(409);
    expect(await errorCodeOf(res)).toBe("ADMIN_APPROVAL_ALREADY_PENDING_CONFLICT");
    expect(moderation.ban).not.toHaveBeenCalled();
  });

  it("refuses a ban without a reason", async () => {
    const res = await send(app(), "POST", "/admin/users/user-2/ban", { reason: "" });

    expect(res.status).toBe(400);
    expect(moderation.ban).not.toHaveBeenCalled();
  });
});

describe("POST /admin/users/:id/unban", () => {
  it("unbans through the staff target check", async () => {
    const res = await send(app(), "POST", "/admin/users/user-2/unban");

    expect(res.status).toBe(200);
    expect(staff.moderate).toHaveBeenCalledWith(
      { actorPermissions: MANAGER.permissions, targetUserId: "user-2" },
      expect.any(Function),
    );
    expect(moderation.unban).toHaveBeenCalledWith({ actorUserId: ACTOR_ID, userId: "user-2" });
  });

  it("surfaces the refusal of the staff target check", async () => {
    staff.moderate.mockResolvedValue(
      Result.fail({ code: "ADMIN_STAFF_TARGET_FORBIDDEN", message: "staff" }),
    );

    const res = await send(app(), "POST", "/admin/users/user-2/unban");

    expect(res.status).toBe(403);
    expect(moderation.unban).not.toHaveBeenCalled();
  });
});

describe("POST /admin/users/:id/reset-password", () => {
  it("sends the reset to the user's own address", async () => {
    const res = await send(app(), "POST", "/admin/users/user-2/reset-password");

    expect(res.status).toBe(200);
    expect(auth.requestPasswordReset).toHaveBeenCalledWith("user-2@example.com");
  });

  it("answers 404 and resets nothing for an unknown user", async () => {
    queries.getUser.mockResolvedValue(Result.ok(Option.none()));

    const res = await send(app(), "POST", "/admin/users/ghost/reset-password");

    expect(res.status).toBe(404);
    expect(moderation.resetPassword).not.toHaveBeenCalled();
  });
});

describe("DELETE /admin/users/:id/sessions", () => {
  it("revokes the sessions of a known user", async () => {
    const res = await send(app(), "DELETE", "/admin/users/user-2/sessions");

    expect(res.status).toBe(200);
    expect(moderation.revokeSessions).toHaveBeenCalledWith({
      actorUserId: ACTOR_ID,
      userId: "user-2",
    });
  });

  it("answers 404 and revokes nothing for an unknown user", async () => {
    queries.getUser.mockResolvedValue(Result.ok(Option.none()));

    const res = await send(app(), "DELETE", "/admin/users/ghost/sessions");

    expect(res.status).toBe(404);
    expect(moderation.revokeSessions).not.toHaveBeenCalled();
  });
});

describe("staff notes on a user", () => {
  it("lists the notes of the user", async () => {
    notes.list.mockResolvedValue(
      Result.ok([{ id: "n-1", authorName: Option.none(), body: "hello", createdAt: CREATED }]),
    );

    const res = await send(app(), "GET", "/admin/users/user-2/notes");

    expect(res.status).toBe(200);
    expect(notes.list).toHaveBeenCalledWith({ type: "user", id: "user-2" });
    expect(await res.json()).toEqual({
      items: [{ id: "n-1", authorName: null, body: "hello", createdAt: CREATED.toISOString() }],
    });
  });

  it("adds a trimmed note signed by the actor", async () => {
    notes.add.mockResolvedValue(Result.ok());

    const res = await send(app(), "POST", "/admin/users/user-2/notes", { body: "  hello  " });

    expect(res.status).toBe(200);
    expect(notes.add).toHaveBeenCalledWith({
      actorUserId: ACTOR_ID,
      subject: { type: "user", id: "user-2" },
      body: "hello",
    });
  });
});
