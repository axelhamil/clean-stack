import { describe, expect, it, mock } from "bun:test";
import { EventTypes } from "@packages/events";

const emitted: { type: string; payload: Record<string, unknown> }[] = [];

mock.module("../../../shared/event-emitter", () => ({
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
  banUser: mock(async () => ({ user: { id: "u-2" } })),
  unbanUser: mock(async () => ({ user: { id: "u-2" } })),
  setRole: mock(async () => ({ user: { id: "u-2" } })),
  revokeUserSessions: mock(async () => ({ success: true })),
  requestPasswordReset: mock(async () => ({ status: true })),
};

mock.module("../../../auth", () => ({ auth: { api: authApi } }));

const { AdminActionService } = await import("../application/services/admin-action.service");

const instrumentation = {
  startSpan: <T>(_o: unknown, fn: () => T) => fn(),
  capture: mock(() => {}),
  addBreadcrumb: mock(() => {}),
};

function service() {
  return new AdminActionService({} as never, instrumentation as never);
}

describe("AdminActionService", () => {
  describe("ban", () => {
    it("emits admin.user.banned with the actor distinct from the subject", async () => {
      emitted.length = 0;
      const result = await service().ban({
        actorUserId: "admin-1",
        userId: "u-2",
        reason: "spam",
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
      const result = await service().ban({ actorUserId: "admin-1", userId: "u-2", reason: "spam" });
      expect(result.isFailure).toBe(true);
      expect(instrumentation.capture).toHaveBeenCalled();
    });
  });

  describe("setRole", () => {
    it("records the previous role in the event payload", async () => {
      emitted.length = 0;
      await service().setRole({
        actorUserId: "admin-1",
        userId: "u-2",
        role: "admin",
        previousRole: "user",
        headers: new Headers(),
      });
      const event = emitted.find((e) => e.type === EventTypes.ADMIN_USER_ROLE_CHANGED);
      expect(event?.payload.from).toBe("user");
      expect(event?.payload.to).toBe("admin");
    });
  });

  describe("unban", () => {
    it("emits admin.user.unbanned with the actor distinct from the subject", async () => {
      emitted.length = 0;
      const result = await service().unban({ actorUserId: "admin-1", userId: "u-2" });
      expect(result.isSuccess).toBe(true);
      const event = emitted.find((e) => e.type === EventTypes.ADMIN_USER_UNBANNED);
      expect(event?.payload.actorUserId).toBe("admin-1");
      expect(event?.payload.userId).toBe("u-2");
    });
  });

  describe("revokeSessions", () => {
    it("emits admin.user.sessions_revoked with the actor distinct from the subject", async () => {
      emitted.length = 0;
      const result = await service().revokeSessions({
        actorUserId: "admin-1",
        userId: "u-2",
        count: 3,
      });
      expect(result.isSuccess).toBe(true);
      const event = emitted.find((e) => e.type === EventTypes.ADMIN_USER_SESSIONS_REVOKED);
      expect(event?.payload.actorUserId).toBe("admin-1");
      expect(event?.payload.userId).toBe("u-2");
    });
  });

  describe("resetPassword", () => {
    it("revokes sessions before sending the reset email", async () => {
      emitted.length = 0;
      await service().resetPassword({
        actorUserId: "admin-1",
        userId: "u-2",
        email: "a@example.com",
      });
      expect(authApi.revokeUserSessions).toHaveBeenCalled();
      expect(authApi.requestPasswordReset).toHaveBeenCalled();
      expect(emitted.some((e) => e.type === EventTypes.ADMIN_USER_PASSWORD_RESET)).toBe(true);
    });
  });
});
