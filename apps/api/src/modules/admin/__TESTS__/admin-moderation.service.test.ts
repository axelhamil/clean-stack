import { describe, expect, it, mock } from "bun:test";
import { type AppError, Option, Result, UnitOfWorkContext } from "@packages/ddd-kit";
import { EventTypes } from "@packages/events";
import { mockPort } from "@packages/test/bun";
import { mockUnitOfWork } from "@packages/test/bun/unit-of-work";
import { enqueuedEvents } from "../../../shared/__TESTS__/enqueued-events";
import type { IOutboxRepository } from "../../../shared/ports/outbox.port";
import type { EndedSession, IAdminUserStore } from "../application/ports/admin-user-store.port";
import { AdminModerationService } from "../application/services/admin-moderation.service";

const SUBJECT = { actorUserId: "admin", userId: "target" };
const ENDED: EndedSession[] = [
  { id: "s1", userId: "target" },
  { id: "s2", userId: "someone-impersonated" },
];

function setup(given: { banned?: Option<EndedSession[]>; unbanned?: boolean } = {}) {
  const store = mockPort<IAdminUserStore>();
  const writeTransactions: unknown[] = [];
  store.ban.mockImplementation(async () => {
    writeTransactions.push(UnitOfWorkContext.transaction());

    return Result.ok(given.banned ?? Option.some(ENDED));
  });
  store.unban.mockImplementation(async () => Result.ok(given.unbanned ?? true));
  store.deleteSessions.mockImplementation(async () =>
    Result.ok([ENDED[0] ?? { id: "", userId: "" }]),
  );

  const outbox = mockPort<IOutboxRepository>();
  const emitTransactions: unknown[] = [];
  outbox.enqueue.mockImplementation(async () => {
    emitTransactions.push(UnitOfWorkContext.transaction());
  });

  const { unitOfWork, outcome } = mockUnitOfWork();
  const service = new AdminModerationService(store, outbox, unitOfWork);

  return { service, store, outbox, outcome, writeTransactions, emitTransactions };
}

const types = (outbox: Parameters<typeof enqueuedEvents>[0]) =>
  enqueuedEvents(outbox).map((event) => event.eventType);

describe("AdminModerationService.ban", () => {
  it("writes and announces in one transaction, each ended session included", async () => {
    const { service, outbox, writeTransactions, emitTransactions } = setup();

    const result = await service.ban({ ...SUBJECT, reason: "spam" });

    expect(result.isSuccess).toBe(true);
    expect(types(outbox)).toEqual([
      EventTypes.USER_SIGNED_OUT,
      EventTypes.USER_SIGNED_OUT,
      EventTypes.ADMIN_USER_BANNED,
    ]);
    expect(writeTransactions[0]).toBeDefined();
    expect(new Set([...writeTransactions, ...emitTransactions]).size).toBe(1);
  });

  it("gives a temporary ban its expiry and a permanent one none", async () => {
    const { service, store, outbox } = setup();

    await service.ban({ ...SUBJECT, reason: "spam" });
    await service.ban({ ...SUBJECT, reason: "spam", expiresIn: 60 });

    const banned = enqueuedEvents(outbox)
      .filter((event) => event.eventType === EventTypes.ADMIN_USER_BANNED)
      .map((event) => event.payload);
    expect(banned[0]).toMatchObject({ actorUserId: "admin", userId: "target", expiresAt: null });
    expect(banned[1]).toMatchObject({ expiresAt: expect.any(String) });
    expect(store.ban.mock.calls[0]?.[0].expiresAt.isNone()).toBe(true);
  });

  it("refuses to ban oneself, like the auth library did", async () => {
    const { service, store } = setup();

    const result = await service.ban({ actorUserId: "admin", userId: "admin", reason: "x" });

    expect(result.getError().code).toBe("ADMIN_USER_SELF_BAN_FORBIDDEN");
    expect(store.ban).not.toHaveBeenCalled();
  });

  it("answers not found and announces nothing for an unknown user", async () => {
    const { service, outbox } = setup({ banned: Option.none() });

    const result = await service.ban({ ...SUBJECT, reason: "spam" });

    expect(result.getError().code).toBe("ADMIN_USER_NOT_FOUND");
    expect(outbox.enqueue).not.toHaveBeenCalled();
  });

  it("rolls the ban back when its event cannot be written", async () => {
    const { service, outbox, outcome } = setup();
    outbox.enqueue.mockImplementation(async () => {
      throw new Error("outbox down");
    });

    await expect(service.ban({ ...SUBJECT, reason: "spam" })).rejects.toThrow("outbox down");

    expect(outcome()).toBe("rolled_back");
  });
});

describe("AdminModerationService.unban", () => {
  it("announces the lift with the actor distinct from the subject", async () => {
    const { service, outbox } = setup();

    await service.unban(SUBJECT);

    expect(enqueuedEvents(outbox)).toEqual([
      {
        eventType: EventTypes.ADMIN_USER_UNBANNED,
        aggregateId: "target",
        payload: { actorUserId: "admin", userId: "target" },
      },
    ]);
  });

  it("answers not found for an unknown user", async () => {
    const { service } = setup({ unbanned: false });

    expect((await service.unban(SUBJECT)).getError().code).toBe("ADMIN_USER_NOT_FOUND");
  });
});

describe("AdminModerationService.revokeSessions", () => {
  it("announces the count of sessions the write really deleted", async () => {
    const { service, outbox } = setup();

    await service.revokeSessions(SUBJECT);

    expect(enqueuedEvents(outbox).at(-1)).toMatchObject({
      eventType: EventTypes.ADMIN_USER_SESSIONS_REVOKED,
      payload: { count: 1 },
    });
  });
});

describe("AdminModerationService.resetPassword", () => {
  it("rolls everything back when the library refuses after the emit", async () => {
    const { service, outbox, outcome } = setup();

    await expect(
      service.resetPassword(SUBJECT, async () => {
        throw new Error("library down");
      }),
    ).rejects.toThrow("library down");

    expect(types(outbox)).toContain(EventTypes.ADMIN_USER_PASSWORD_RESET);
    expect(outcome()).toBe("rolled_back");
  });
});

describe("AdminModerationService impersonation", () => {
  const start = {
    ...SUBJECT,
    reason: "ticket 42",
    ip: null,
    expiresAt: "2026-10-30T13:00:00.000Z",
  };

  it("emits before calling the library, so a refused call discards the event", async () => {
    const { service, outbox, outcome } = setup();
    const library = mock(async () => {
      expect(types(outbox)).toEqual([EventTypes.ADMIN_IMPERSONATION_STARTED]);

      return Result.fail<string, AppError<"ADMIN_IMPERSONATION_FORBIDDEN">>({
        code: "ADMIN_IMPERSONATION_FORBIDDEN",
        message: "refused",
      });
    });

    const result = await service.startImpersonation(start, library);

    expect(library).toHaveBeenCalledTimes(1);
    expect(result.isFailure).toBe(true);
    expect(outcome()).toBe("rolled_back");
  });

  it("hands the library's answer back on success", async () => {
    const { service, outcome } = setup();

    const result = await service.startImpersonation(start, async () => Result.ok("cookie"));

    expect(result.getValue()).toBe("cookie");
    expect(outcome()).toBe("committed");
  });
});
