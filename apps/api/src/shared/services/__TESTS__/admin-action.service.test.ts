import { describe, expect, it, mock } from "bun:test";
import { EventTypes } from "@packages/events";

const emitted: { type: string; payload: Record<string, unknown> }[] = [];

mock.module("../../event-emitter", () => ({
  emitEvent: mock(
    async (
      _o: unknown,
      type: string,
      _at: string,
      _ai: string,
      payload: Record<string, unknown>,
    ) => {
      emitted.push({ type, payload });
      return "evt-1";
    },
  ),
}));

const authApi = {
  banUser: mock(async (_args: unknown) => ({ user: { id: "u-2" } })),
  unbanUser: mock(async (_args: unknown) => ({ user: { id: "u-2" } })),
  setRole: mock(async (_args: unknown) => ({ user: { id: "u-2" } })),
  revokeUserSessions: mock(async (_args: unknown) => ({ success: true })),
  requestPasswordReset: mock(async (_args: unknown) => ({ status: true })),
};

mock.module("../../../auth", () => ({ auth: { api: authApi } }));

const { AdminActionService } = await import("../admin-action.service");

const instrumentation = {
  startSpan: <T>(_o: unknown, fn: () => T) => fn(),
  capture: mock(() => {}),
  addBreadcrumb: mock(() => {}),
  setSpanAttributes: mock(() => {}),
};

const fakeTx = {
  update: () => ({ set: () => ({ where: async () => undefined }) }),
} as never;

const noopUow = {
  startTransaction: async (cb: (tx: unknown) => unknown) => cb(fakeTx),
  run: async (cb: (tx: unknown) => unknown) => cb(fakeTx),
};

function service() {
  return new AdminActionService({} as never, noopUow as never, instrumentation as never);
}

function makeHeaders(token = "tok-1") {
  return new Headers({ authorization: `Bearer ${token}`, cookie: "session=abc" });
}

describe("AdminActionService", () => {
  describe("ban", () => {
    it("passes headers to auth.api.banUser", async () => {
      authApi.banUser.mockClear();
      const headers = makeHeaders();
      await service().ban({ actorUserId: "admin-1", userId: "u-2", reason: "spam", headers });
      expect(authApi.banUser).toHaveBeenCalledWith(expect.objectContaining({ headers }));
    });

    it("emits admin.user.banned with the actor distinct from the subject", async () => {
      emitted.length = 0;
      const result = await service().ban({
        actorUserId: "admin-1",
        userId: "u-2",
        reason: "spam",
        headers: makeHeaders(),
      });
      expect(result.isSuccess).toBe(true);
      const event = emitted.find((e) => e.type === EventTypes.ADMIN_USER_BANNED);
      expect(event?.payload.actorUserId).toBe("admin-1");
      expect(event?.payload.userId).toBe("u-2");
    });

    it("fails and captures when BetterAuth rejects the ban", async () => {
      authApi.banUser.mockImplementationOnce(async () => {
        throw new Error("nope");
      });
      const result = await service().ban({
        actorUserId: "admin-1",
        userId: "u-2",
        reason: "spam",
        headers: makeHeaders(),
      });
      expect(result.isFailure).toBe(true);
      expect(instrumentation.capture).toHaveBeenCalled();
    });
  });

  describe("unban", () => {
    it("passes headers to auth.api.unbanUser", async () => {
      authApi.unbanUser.mockClear();
      const headers = makeHeaders();
      await service().unban({ actorUserId: "admin-1", userId: "u-2", headers });
      expect(authApi.unbanUser).toHaveBeenCalledWith(expect.objectContaining({ headers }));
    });

    it("emits admin.user.unbanned with the actor distinct from the subject", async () => {
      emitted.length = 0;
      const result = await service().unban({
        actorUserId: "admin-1",
        userId: "u-2",
        headers: makeHeaders(),
      });
      expect(result.isSuccess).toBe(true);
      const event = emitted.find((e) => e.type === EventTypes.ADMIN_USER_UNBANNED);
      expect(event?.payload.actorUserId).toBe("admin-1");
      expect(event?.payload.userId).toBe("u-2");
    });
  });

  describe("setRole", () => {
    it("passes headers to auth.api.setRole", async () => {
      authApi.setRole.mockClear();
      const headers = makeHeaders();
      await service().setRole({
        actorUserId: "admin-1",
        userId: "u-2",
        role: "admin",
        previousRole: "user",
        headers,
      });
      expect(authApi.setRole).toHaveBeenCalledWith(expect.objectContaining({ headers }));
    });

    it("records the previous role in the event payload", async () => {
      emitted.length = 0;
      await service().setRole({
        actorUserId: "admin-1",
        userId: "u-2",
        role: "admin",
        previousRole: "user",
        headers: makeHeaders(),
      });
      const event = emitted.find((e) => e.type === EventTypes.ADMIN_USER_ROLE_CHANGED);
      expect(event?.payload.from).toBe("user");
      expect(event?.payload.to).toBe("admin");
    });
  });

  describe("revokeSessions", () => {
    it("passes headers to auth.api.revokeUserSessions", async () => {
      authApi.revokeUserSessions.mockClear();
      const headers = makeHeaders();
      await service().revokeSessions({ actorUserId: "admin-1", userId: "u-2", count: 3, headers });
      expect(authApi.revokeUserSessions).toHaveBeenCalledWith(expect.objectContaining({ headers }));
    });

    it("emits admin.user.sessions_revoked with the actor distinct from the subject", async () => {
      emitted.length = 0;
      const result = await service().revokeSessions({
        actorUserId: "admin-1",
        userId: "u-2",
        count: 3,
        headers: makeHeaders(),
      });
      expect(result.isSuccess).toBe(true);
      const event = emitted.find((e) => e.type === EventTypes.ADMIN_USER_SESSIONS_REVOKED);
      expect(event?.payload.actorUserId).toBe("admin-1");
      expect(event?.payload.userId).toBe("u-2");
    });
  });

  describe("resetPassword", () => {
    it("passes headers to auth.api.revokeUserSessions before the reset email", async () => {
      authApi.revokeUserSessions.mockClear();
      const headers = makeHeaders();
      await service().resetPassword({
        actorUserId: "admin-1",
        userId: "u-2",
        email: "a@example.com",
        headers,
      });
      expect(authApi.revokeUserSessions).toHaveBeenCalledWith(expect.objectContaining({ headers }));
    });

    it("revokes sessions before sending the reset email", async () => {
      emitted.length = 0;
      await service().resetPassword({
        actorUserId: "admin-1",
        userId: "u-2",
        email: "a@example.com",
        headers: makeHeaders(),
      });
      expect(authApi.revokeUserSessions).toHaveBeenCalled();
      expect(authApi.requestPasswordReset).toHaveBeenCalled();
      expect(emitted.some((e) => e.type === EventTypes.ADMIN_USER_PASSWORD_RESET)).toBe(true);
    });
  });

  describe("setSsoEnforcement", () => {
    it("records the platform admin as actor when lifting sso enforcement", async () => {
      emitted.length = 0;
      const result = await service().setSsoEnforcement({
        organizationId: "org-1",
        enforced: false,
        actorUserId: "admin-9",
        viaPlatformAdmin: true,
      });

      expect(result.isSuccess).toBe(true);
      expect(emitted[0]?.type).toBe(EventTypes.SSO_ENFORCEMENT_CHANGED);
      expect(emitted[0]?.payload).toMatchObject({
        actorUserId: "admin-9",
        organizationId: "org-1",
        enforced: false,
        viaPlatformAdmin: true,
      });
    });

    it("records the org owner as actor when enabling sso enforcement", async () => {
      emitted.length = 0;
      const result = await service().setSsoEnforcement({
        organizationId: "org-1",
        enforced: true,
        actorUserId: "owner-1",
        viaPlatformAdmin: false,
      });

      expect(result.isSuccess).toBe(true);
      expect(emitted[0]?.type).toBe(EventTypes.SSO_ENFORCEMENT_CHANGED);
      expect(emitted[0]?.payload).toMatchObject({
        actorUserId: "owner-1",
        organizationId: "org-1",
        enforced: true,
        viaPlatformAdmin: false,
      });
    });
  });
});
