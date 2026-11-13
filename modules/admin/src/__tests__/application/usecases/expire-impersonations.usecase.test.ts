import { describe, expect, it } from "bun:test";
import { Result } from "@packages/ddd-kit";
import { EventTypes } from "@packages/events";
import type { IOutboxRepository } from "@packages/outbox/outbox.port";
import { enqueuedEvents } from "@packages/outbox/testing/enqueued-events";
import { mockPort } from "@packages/test/bun";
import { mockUnitOfWork } from "@packages/test/bun/unit-of-work";
import type {
  EndedImpersonation,
  IStaffStore,
} from "../../../application/ports/repositories/staff-store.port";
import { ExpireImpersonationsUseCase } from "../../../application/usecases/expire-impersonations/expire-impersonations.usecase";

const HOUR_MS = 60 * 60 * 1000;
const STAFF = "staff-1";
const CUSTOMER = "customer";

function impersonation(startedMsAgo: number, sessionId: string): EndedImpersonation {
  const createdAt = new Date(Date.now() - startedMsAgo);

  return {
    sessionId,
    userId: CUSTOMER,
    impersonatedBy: STAFF,
    createdAt,
    expiresAt: new Date(createdAt.getTime() + HOUR_MS),
  };
}

function setup() {
  const store = mockPort<IStaffStore>();
  const outbox = mockPort<IOutboxRepository>();
  outbox.enqueue.mockImplementation(async () => {});
  const { unitOfWork } = mockUnitOfWork();

  return { store, outbox, useCase: new ExpireImpersonationsUseCase(store, outbox, unitOfWork) };
}

const ofType = (outbox: Parameters<typeof enqueuedEvents>[0], eventType: string) =>
  enqueuedEvents(outbox).filter((event) => event.eventType === eventType);

describe("ExpireImpersonationsUseCase", () => {
  it("given two expired sessions, when swept twice, then each is announced once with its full length", async () => {
    const { store, outbox, useCase } = setup();
    const expired = [impersonation(2 * HOUR_MS, "s1"), impersonation(3 * HOUR_MS, "s2")];
    store.endExpiredImpersonations.mockImplementationOnce(async () => Result.ok(expired));
    store.endExpiredImpersonations.mockImplementationOnce(async () => Result.ok([]));

    const first = await useCase.execute({ batchSize: 100 });
    const second = await useCase.execute({ batchSize: 100 });

    expect(first.getValue()).toBe(2);
    expect(second.getValue()).toBe(0);
    expect(store.endExpiredImpersonations).toHaveBeenCalledWith(100);
    expect(ofType(outbox, EventTypes.ADMIN_IMPERSONATION_STOPPED)).toEqual(
      ["s1", "s2"].map(() => ({
        eventType: EventTypes.ADMIN_IMPERSONATION_STOPPED,
        aggregateId: CUSTOMER,
        payload: {
          actorUserId: STAFF,
          userId: CUSTOMER,
          durationMs: HOUR_MS,
          endReason: "expired",
        },
      })),
    );
  });

  it("given expired sessions, when swept, then each is announced as signed out by no one", async () => {
    const { store, outbox, useCase } = setup();
    store.endExpiredImpersonations.mockImplementation(async () =>
      Result.ok([impersonation(2 * HOUR_MS, "s1"), impersonation(2 * HOUR_MS, "s2")]),
    );

    await useCase.execute({ batchSize: 100 });

    expect(ofType(outbox, EventTypes.USER_SIGNED_OUT)).toEqual(
      ["s1", "s2"].map((sessionId) => ({
        eventType: EventTypes.USER_SIGNED_OUT,
        aggregateId: sessionId,
        payload: { userId: CUSTOMER, sessionId, actorUserId: null },
      })),
    );
  });

  it("given a failing store, when swept, then the failure surfaces and nothing is announced", async () => {
    const { store, outbox, useCase } = setup();
    store.endExpiredImpersonations.mockImplementation(async () =>
      Result.fail({ code: "ADMIN_STAFF_PROVIDER_FAILURE", message: "down" }),
    );

    const result = await useCase.execute({ batchSize: 100 });

    expect(result.getError().code).toBe("ADMIN_STAFF_PROVIDER_FAILURE");
    expect(enqueuedEvents(outbox)).toEqual([]);
  });
});
