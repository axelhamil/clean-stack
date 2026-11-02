import { afterEach, beforeEach, describe, expect, it, spyOn } from "bun:test";
import { InMemoryEventDispatcher, Option, Result, UnitOfWorkContext } from "@packages/ddd-kit";
import { EventTypes, OUTBOX_LAST_ERROR_MAX_LENGTH, OutboxEventDeadPayload } from "@packages/events";
import { mockPort, type PortMock } from "@packages/test/bun";
import { mockUnitOfWork, type UnitOfWorkMock } from "@packages/test/bun/unit-of-work";
import { mockInstrumentation } from "../../../__TESTS__/mock-instrumentation";
import { logger } from "../../logger";
import type { IInstrumentation } from "../../ports/instrumentation.port";
import type {
  DeliveredEvent,
  IOutboxRepository,
  OutboxFailure,
  OutboxRecord,
} from "../../ports/outbox.port";
import { claimLimitOf, OutboxRelay, type OutboxRelayOptions } from "../outbox-relay";

const TYPE = EventTypes.USER_CREATED;

const OPTIONS: OutboxRelayOptions = {
  eventTypes: [TYPE],
  batchSize: 50,
  maxAttempts: 10,
  leaseSeconds: 120,
  deadRetrySeconds: 6 * 3600,
  concurrency: 4,
  handlerBudgetSeconds: 30,
};

function record(overrides: Partial<OutboxRecord> = {}): OutboxRecord {
  return {
    id: "evt-1",
    eventType: TYPE,
    aggregateId: "u1",
    aggregateType: "user",
    organizationId: Option.some("org-1"),
    payload: { userId: "u1" },
    metadata: {
      specversion: "1.0",
      source: "test",
      datacontenttype: "application/json",
      requestId: "req-1",
    },
    occurredAt: new Date("2026-10-01T00:00:00Z"),
    attempts: 1,
    deadAt: Option.none(),
    deliveries: {},
    ...overrides,
  };
}

let repository: PortMock<IOutboxRepository>;
let dispatcher: InMemoryEventDispatcher<DeliveredEvent>;
let uow: UnitOfWorkMock;
let instrumentation: PortMock<IInstrumentation>;

function relay(options: Partial<OutboxRelayOptions> = {}) {
  return new OutboxRelay(
    repository,
    uow.unitOfWork,
    dispatcher,
    { ...OPTIONS, ...options },
    instrumentation,
    logger,
  );
}

function capturedMessages(): string[] {
  return instrumentation.capture.mock.calls.map(([err]) =>
    err instanceof Error ? err.message : String(err),
  );
}

function claims(...records: OutboxRecord[]) {
  repository.claim.mockResolvedValue(Result.ok(records));
}

function failure(): OutboxFailure | undefined {
  return repository.markFailed.mock.calls.at(-1)?.[1];
}

function enqueuedTypes(): string[] {
  return repository.enqueue.mock.calls.flatMap(([events]) => events.map((e) => e.eventType));
}

beforeEach(() => {
  repository = mockPort<IOutboxRepository>();
  repository.markDelivered.mockResolvedValue(Result.ok(true));
  repository.markFailed.mockResolvedValue(Result.ok(true));
  repository.release.mockResolvedValue(Result.ok(true));
  repository.enqueue.mockResolvedValue(undefined);
  dispatcher = new InMemoryEventDispatcher<DeliveredEvent>();
  uow = mockUnitOfWork();
  instrumentation = mockInstrumentation();
});

afterEach(() => {
  spyOn(logger, "warn").mockRestore();
});

describe("OutboxRelay.drainOnce", () => {
  it("delivers a claimed event to every handler outside any transaction then marks it delivered with their names", async () => {
    const seen: Array<{ event: DeliveredEvent; inTransaction: boolean }> = [];
    const handler = (event: DeliveredEvent) => {
      seen.push({ event, inTransaction: UnitOfWorkContext.transaction() !== undefined });
    };
    dispatcher.subscribe(TYPE, "audit-log", handler);
    dispatcher.subscribe(TYPE, "webhook-fanout", handler);
    claims(record());

    const outcome = await relay().drainOnce();

    expect(outcome).toEqual({ dispatched: 1, failed: 0, died: 0, released: 0 });
    expect(seen.map(({ inTransaction }) => inTransaction)).toEqual([false, false]);
    expect(seen[0]?.event).toMatchObject({
      eventId: "evt-1",
      organizationId: "org-1",
      requestId: "req-1",
      aggregateType: "user",
    });
    const [lease, deliveries] = repository.markDelivered.mock.calls[0] ?? [];
    expect(lease).toMatchObject({ id: "evt-1", attempts: 1 });
    expect(Object.keys(deliveries ?? {}).sort()).toEqual(["audit-log", "webhook-fanout"]);
  });

  it("a failing handler leaves the others delivered and the event retried with only the blocked handler", async () => {
    dispatcher.subscribe(TYPE, "audit-log", () => {});
    dispatcher.subscribe(TYPE, "webhook-fanout", () => {
      throw new Error("boom");
    });
    claims(record({ attempts: 2 }));

    const outcome = await relay().drainOnce();

    expect(outcome).toEqual({ dispatched: 0, failed: 1, died: 0, released: 0 });
    expect(repository.markDelivered).not.toHaveBeenCalled();
    expect(failure()?.lastError).toBe("webhook-fanout: boom");
    expect(Object.keys(failure()?.deliveries ?? {})).toEqual(["audit-log"]);
    expect(failure()?.dead).toBe(false);
    expect(failure()?.retryAfterSeconds).toBeGreaterThan(0);
    expect(failure()?.retryAfterSeconds).toBeLessThan(OPTIONS.deadRetrySeconds);
  });

  it("a handler already in deliveries is not run again", async () => {
    const ran: string[] = [];
    dispatcher.subscribe(TYPE, "audit-log", () => {
      ran.push("audit-log");
    });
    dispatcher.subscribe(TYPE, "webhook-fanout", () => {
      ran.push("webhook-fanout");
    });
    claims(record({ attempts: 3, deliveries: { "audit-log": "2026-10-01T00:00:01Z" } }));

    await relay().drainOnce();

    expect(ran).toEqual(["webhook-fanout"]);
    expect(Object.keys(repository.markDelivered.mock.calls[0]?.[1] ?? {})).toEqual([
      "webhook-fanout",
    ]);
  });

  it("the 10th failed attempt marks the event dead and enqueues one OUTBOX_EVENT_DEAD, the 11th does not enqueue another", async () => {
    dispatcher.subscribe(TYPE, "audit-log", () => {
      throw new Error("gone");
    });
    claims(record({ attempts: 10 }));

    const tenth = await relay().drainOnce();

    expect(tenth).toEqual({ dispatched: 0, failed: 1, died: 1, released: 0 });
    expect(failure()).toMatchObject({ dead: true, retryAfterSeconds: OPTIONS.deadRetrySeconds });
    expect(enqueuedTypes()).toEqual([EventTypes.OUTBOX_EVENT_DEAD]);
    expect(repository.enqueue.mock.calls[0]?.[0][0]?.payload).toEqual({
      eventId: "evt-1",
      eventType: TYPE,
      aggregateId: "u1",
      attempts: 10,
      lastError: "audit-log: gone",
      failedHandlers: ["audit-log"],
      actorUserId: null,
    });

    claims(record({ attempts: 11, deadAt: Option.some(new Date()) }));
    const eleventh = await relay().drainOnce();

    expect(eleventh).toEqual({ dispatched: 0, failed: 1, died: 0, released: 0 });
    expect(enqueuedTypes()).toEqual([EventTypes.OUTBOX_EVENT_DEAD]);
  });

  it("a dead OUTBOX_EVENT_DEAD is never announced as dead again", async () => {
    dispatcher.subscribe(EventTypes.OUTBOX_EVENT_DEAD, "audit-log", () => {
      throw new Error("gone");
    });
    claims(record({ eventType: EventTypes.OUTBOX_EVENT_DEAD, attempts: 10 }));

    await relay({ eventTypes: [EventTypes.OUTBOX_EVENT_DEAD] }).drainOnce();

    expect(failure()?.dead).toBe(true);
    expect(repository.enqueue).not.toHaveBeenCalled();
  });

  it("a dead event is retried after the 6 hour delay", async () => {
    dispatcher.subscribe(TYPE, "audit-log", () => {
      throw new Error("still gone");
    });
    claims(record({ attempts: 14, deadAt: Option.some(new Date()) }));

    await relay().drainOnce();

    expect(failure()).toMatchObject({ dead: true, retryAfterSeconds: 6 * 3600 });
  });

  it("a handler exceeding its budget is failed as timed out", async () => {
    dispatcher.subscribe(TYPE, "webhook-fanout", () => new Promise<void>(() => {}));
    claims(record());

    const outcome = await relay({ handlerBudgetSeconds: 0.02 }).drainOnce();

    expect(outcome.failed).toBe(1);
    expect(failure()?.lastError).toBe("webhook-fanout: timed out");
  });

  it("claim limit never exceeds what the lease can process", async () => {
    claims();

    await relay().drainOnce();

    expect(claimLimitOf(OPTIONS)).toBe(12);
    expect(claimLimitOf({ ...OPTIONS, leaseSeconds: 40 })).toBe(4);
    expect(repository.claim.mock.calls[0]?.[0]).toMatchObject({ limit: 12, leaseSeconds: 120 });
  });

  it("a stale lease settle (the repository wrote nothing) is neither counted nor announced", async () => {
    dispatcher.subscribe(TYPE, "audit-log", () => {});
    repository.markDelivered.mockResolvedValue(Result.ok(false));
    claims(record());

    const delivered = await relay().drainOnce();

    dispatcher = new InMemoryEventDispatcher<DeliveredEvent>();
    dispatcher.subscribe(TYPE, "audit-log", () => {
      throw new Error("gone");
    });
    repository.markFailed.mockResolvedValue(Result.ok(false));
    claims(record({ attempts: 10 }));

    const dying = await relay().drainOnce();

    expect(delivered).toEqual({ dispatched: 0, failed: 0, died: 0, released: 0 });
    expect(dying).toEqual({ dispatched: 0, failed: 0, died: 0, released: 0 });
    expect(repository.enqueue).not.toHaveBeenCalled();
    expect(capturedMessages()).not.toContain("outbox event dead");
  });

  it("a death and its announcement commit in one unit of work", async () => {
    const inTransaction: string[] = [];
    repository.markFailed.mockImplementation(async () => {
      if (UnitOfWorkContext.transaction()) inTransaction.push("markFailed");
      return Result.ok(true);
    });
    repository.enqueue.mockImplementation(async () => {
      if (UnitOfWorkContext.transaction()) inTransaction.push("enqueue");
    });
    dispatcher.subscribe(TYPE, "audit-log", () => {
      throw new Error("gone");
    });
    claims(record({ attempts: 10 }));

    await relay().drainOnce();

    expect(inTransaction).toEqual(["markFailed", "enqueue"]);
    expect(uow.outcome()).toBe("committed");
  });

  it("a failed announcement rolls the death back so the next claim announces it", async () => {
    repository.enqueue.mockRejectedValue(new Error("outbox_unavailable: down"));
    dispatcher.subscribe(TYPE, "audit-log", () => {
      throw new Error("gone");
    });
    claims(record({ attempts: 10 }));

    await expect(relay().drainOnce()).rejects.toThrow("outbox_unavailable: down");

    expect(uow.outcome()).toBe("rolled_back");
  });

  it("a failed settle warns with the event and its failing handlers, and captures each failure", async () => {
    const warn = spyOn(logger, "warn");
    dispatcher.subscribe(TYPE, "audit-log", () => {});
    dispatcher.subscribe(TYPE, "webhook-fanout", () => {
      throw new Error("boom");
    });
    dispatcher.subscribe(TYPE, "notification-fanout", () => new Promise<void>(() => {}));
    claims(record({ attempts: 2 }));

    await relay({ handlerBudgetSeconds: 0.02 }).drainOnce();

    expect(warn.mock.calls[0]?.[0]).toMatchObject({
      eventId: "evt-1",
      eventType: TYPE,
      attempts: 2,
      failedHandlers: ["webhook-fanout", "notification-fanout"],
    });
    expect(capturedMessages()).toEqual([
      "outbox handler webhook-fanout failed: boom",
      "outbox handler notification-fanout failed: timed out",
    ]);
  });

  it("a stored error is scrubbed of query strings, emails and SQL params, then truncated", async () => {
    dispatcher.subscribe(TYPE, "audit-log", () => {
      throw new Error(
        "Failed query: select * from users where email = 'ada@example.com' via https://hook.example.com/cb?token=s3cret\nparams: ada@example.com,s3cret",
      );
    });
    dispatcher.subscribe(TYPE, "webhook-fanout", () => {
      throw new Error("x".repeat(OUTBOX_LAST_ERROR_MAX_LENGTH * 2));
    });
    claims(record({ attempts: 10 }));

    await relay().drainOnce();

    const stored = failure()?.lastError ?? "";
    const announced = OutboxEventDeadPayload.safeParse(
      repository.enqueue.mock.calls[0]?.[0][0]?.payload,
    );
    expect(stored).toStartWith(
      "audit-log: Failed query: select * from users where email = '[email]' via https://hook.example.com/cb; webhook-fanout: xxx",
    );
    expect(stored).not.toContain("s3cret");
    expect(stored).not.toContain("ada@example.com");
    expect(stored.length).toBe(OUTBOX_LAST_ERROR_MAX_LENGTH);
    expect(announced.success && announced.data.lastError).toBe(stored);
  });

  it("a type with no subscriber fails and stays pending", async () => {
    claims(record());

    const outcome = await relay().drainOnce();

    expect(outcome).toEqual({ dispatched: 0, failed: 1, died: 0, released: 0 });
    expect(failure()).toMatchObject({
      lastError: `${TYPE} has no subscriber in this process`,
      dead: false,
      deliveries: {},
    });
  });

  it("an unavailable outbox rejects the drain for its caller to retry", async () => {
    repository.claim.mockResolvedValue(Result.fail("outbox_unavailable: connection refused"));

    await expect(relay().drainOnce()).rejects.toThrow("outbox_unavailable: connection refused");
  });

  it("a shutdown abandons a running handler and releases the event without an attempt penalty", async () => {
    dispatcher.subscribe(TYPE, "webhook-fanout", () => new Promise<void>(() => {}));
    claims(record({ attempts: 10 }));
    const subject = relay();

    const draining = subject.drainOnce();
    await new Promise((resolve) => setTimeout(resolve, 5));
    subject.abandonInFlight();
    const outcome = await draining;

    expect(outcome).toEqual({ dispatched: 0, failed: 0, died: 0, released: 1 });
    expect(repository.markFailed).not.toHaveBeenCalled();
    expect(repository.release.mock.calls[0]?.[0]).toMatchObject({ id: "evt-1", attempts: 10 });
    expect(repository.enqueue).not.toHaveBeenCalled();
  });

  it("records claimed but not started when the relay halts are released untouched", async () => {
    let finish: () => void = () => {};
    const ran: string[] = [];
    dispatcher.subscribe(TYPE, "audit-log", (event) => {
      ran.push(event.eventId);
      return new Promise<void>((resolve) => {
        finish = resolve;
      });
    });
    claims(record(), record({ id: "evt-2" }));
    const subject = relay({ concurrency: 1 });

    const draining = subject.drainOnce();
    await new Promise((resolve) => setTimeout(resolve, 5));
    subject.halt();
    finish();
    const outcome = await draining;

    expect(ran).toEqual(["evt-1"]);
    expect(outcome).toEqual({ dispatched: 1, failed: 0, died: 0, released: 1 });
    expect(repository.release.mock.calls.map(([lease]) => lease.id)).toEqual(["evt-2"]);
  });
});
