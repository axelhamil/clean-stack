import { beforeEach, describe, expect, it } from "bun:test";
import { Option, Result, UnitOfWorkContext } from "@packages/ddd-kit";
import { EventTypes } from "@packages/events";
import type { Locale } from "@packages/i18n";
import { mockPort, type PortMock } from "@packages/test/bun";
import { mockUnitOfWork, type UnitOfWorkMock } from "@packages/test/bun/unit-of-work";
import { mockInstrumentation } from "../../__TESTS__/mock-instrumentation";
import type { Logger } from "../logger";
import type {
  EmailFailure,
  EmailLease,
  EmailMessageRecord,
  IEmailQueue,
} from "../ports/email-queue.port";
import type { IOutboxRepository } from "../ports/outbox.port";
import { NoOpInstrumentation } from "../services/noop-instrumentation";
import { enqueuedEvents } from "./enqueued-events";

// `@packages/emails` is intentionally NOT mocked here: nothing in this file asserts
// on rendered content (only on which row got claimed/sent), so exercising the real
// renderer is both cheaper than a stub and closer to what ships.

const { EmailDeliveryWorker, chunkIdempotencyKey, resendBatchSender } = await import(
  "../services/email-delivery-worker.service"
);

const OPTIONS = { leaseSeconds: 120, deadRetrySeconds: 21_600, deadReplayWindowHours: 24 };

type BatchResult = {
  data: Array<{ id: string }> | null;
  errors?: Array<{ index: number; message: string }>;
  error: null | { statusCode?: number; message: string };
};

const row = (over: Partial<EmailMessageRecord>): EmailMessageRecord => ({
  id: "1",
  kind: "template",
  template: Option.some("delete_completed"),
  toAddress: "a@x.test",
  subject: "s",
  locale: Option.none<Locale>(),
  payload: { name: "Ada" },
  status: "pending",
  attempts: 1,
  nextAttemptAt: Option.none<Date>(),
  lastError: Option.none<string>(),
  idempotencyKey: Option.none<string>(),
  createdAt: new Date("2026-08-04T00:00:00Z"),
  ...over,
});

const logger = mockPort<Logger>();
let queue: PortMock<IEmailQueue>;
let outbox: PortMock<IOutboxRepository>;
let uow: UnitOfWorkMock;
let batch: (entries: unknown[]) => Promise<BatchResult>;
let failedIn: unknown[];
let now: number;

const accepted = async (entries: unknown[]): Promise<BatchResult> => ({
  data: entries.map((_, i) => ({ id: `provider-${i}` })),
  error: null,
});

function claims(rows: EmailMessageRecord[]): void {
  queue.claim.mockResolvedValue(Result.ok(rows));
}

function worker(options = OPTIONS, clock = () => now) {
  return new EmailDeliveryWorker(
    queue,
    outbox,
    uow.unitOfWork,
    logger,
    new NoOpInstrumentation(),
    options,
    { batchSend: (entries) => batch(entries) },
    clock,
  );
}

const failures = (): EmailFailure[] => queue.markFailed.mock.calls.map(([, failure]) => failure);
const sentIds = () => queue.markSent.mock.calls.flatMap(([leases]) => leases.map(({ id }) => id));

beforeEach(() => {
  queue = mockPort<IEmailQueue>();
  outbox = mockPort<IOutboxRepository>();
  uow = mockUnitOfWork();
  batch = accepted;
  failedIn = [];
  now = 0;
  queue.markSent.mockImplementation(async (leases: EmailLease[]) => Result.ok(leases));
  queue.markFailed.mockImplementation(async () => {
    failedIn.push(UnitOfWorkContext.transaction());
    return Result.ok(true);
  });
  queue.release.mockImplementation(async (leases: EmailLease[]) => Result.ok(leases.length));
});

describe("EmailDeliveryWorker.drainOnce", () => {
  it("claims by lease with the configured lease and replay window", async () => {
    claims([]);

    await worker().drainOnce();

    expect(queue.claim).toHaveBeenCalledWith({
      limit: 300,
      leaseSeconds: 120,
      deadReplayWindowHours: 24,
    });
  });

  it("claims no more messages than the lease covers with one send timeout per chunk", async () => {
    claims([]);

    await worker({ ...OPTIONS, leaseSeconds: 60 }).drainOnce();

    expect(queue.claim.mock.calls.map(([request]) => request.limit)).toEqual([100]);
  });

  it("releases the chunks the remaining lease no longer covers", async () => {
    claims([row({ id: "1" }), row({ id: "2", template: Option.some("delete_cancelled") })]);
    batch = async (entries) => {
      now += 100_000;
      return accepted(entries);
    };

    await worker().drainOnce();

    expect(sentIds()).toEqual(["1"]);
    expect(queue.release.mock.calls.flatMap(([leases]) => leases.map(({ id }) => id))).toEqual([
      "2",
    ]);
  });

  it("a timed-out send keeps the rows pending for a retry", async () => {
    claims([row({ id: "1" })]);
    batch = async () => ({ data: null, error: { statusCode: 0, message: "timed out" } });

    await worker().drainOnce();

    expect(failures().map((f) => f.status)).toEqual(["pending"]);
  });

  it("settles a row that fails to render as failed and still sends the rest of the claim", async () => {
    claims([row({ id: "1", template: Option.some("no_such_template") }), row({ id: "2" })]);

    await worker().drainOnce();

    expect(sentIds()).toEqual(["2"]);
    expect(failures()).toEqual([
      { lastError: expect.stringContaining("render failed"), status: "failed" },
    ]);
    expect(enqueuedEvents(outbox).map(({ eventType, payload }) => [eventType, payload])).toEqual([
      [EventTypes.EMAIL_DELIVERY_EXHAUSTED, expect.objectContaining({ messageId: "1" })],
    ]);
  });

  it("sends one batch request per template group", async () => {
    claims([
      row({ id: "1" }),
      row({ id: "2" }),
      row({ id: "3", template: Option.some("delete_cancelled") }),
    ]);
    const requests: unknown[][] = [];
    batch = async (entries) => {
      requests.push(entries);
      return accepted(entries);
    };

    await worker().drainOnce();

    expect(requests.map((r) => r.length)).toEqual([2, 1]);
  });

  it("chunks a group larger than the provider cap", async () => {
    claims(Array.from({ length: 150 }, (_, i) => row({ id: String(i) })));
    const requests: unknown[][] = [];
    batch = async (entries) => {
      requests.push(entries);
      return accepted(entries);
    };

    await worker().drainOnce();

    expect(requests.map((r) => r.length)).toEqual([100, 50]);
  });

  it("settles sent rows with the provider ids that came back aligned", async () => {
    claims([row({ id: "1" }), row({ id: "2" })]);

    await worker().drainOnce();

    expect(sentIds()).toEqual(["1", "2"]);
    expect(queue.markSent.mock.calls[0]?.[1]).toEqual({ 1: "provider-0", 2: "provider-1" });
  });

  it("does not attach provider ids when data is not positionally aligned", async () => {
    claims([row({ id: "1" }), row({ id: "2", toAddress: "bad" })]);
    batch = async () => ({
      data: [{ id: "p0" }],
      errors: [{ index: 1, message: "invalid" }],
      error: null,
    });

    await worker().drainOnce();

    expect(queue.markSent.mock.calls[0]?.[1]).toEqual({});
  });

  it("retryable error under max attempts keeps the row pending with a retry delay", async () => {
    claims([row({ id: "1", attempts: 2 }), row({ id: "2", attempts: 2 })]);
    batch = async () => ({ data: null, error: { statusCode: 429, message: "rate limited" } });

    await worker().drainOnce();

    expect(sentIds()).toEqual([]);
    expect(failures().map((f) => f.status)).toEqual(["pending", "pending"]);
    for (const failure of failures()) {
      expect(failure.status === "pending" && failure.retryAfterSeconds).toBeGreaterThan(0);
    }
    expect(enqueuedEvents(outbox)).toEqual([]);
  });

  it("a third failed send stays pending, as before the lease model", async () => {
    claims([row({ id: "1", attempts: 3 })]);
    batch = async () => ({ data: null, error: { statusCode: 503, message: "down" } });

    await worker().drainOnce();

    expect(failures().map((f) => f.status)).toEqual(["pending"]);
    expect(enqueuedEvents(outbox)).toEqual([]);
  });

  it("exhausted retries mark the row dead on the fourth send and emit EMAIL_DELIVERY_EXHAUSTED once", async () => {
    claims([row({ id: "1", attempts: 4 })]);
    batch = async () => ({ data: null, error: { statusCode: 503, message: "down" } });

    await worker().drainOnce();

    expect(failures()).toEqual([
      { lastError: "HTTP 503: down", status: "dead", retryAfterSeconds: 21_600 },
    ]);
    expect(enqueuedEvents(outbox).map(({ eventType, payload }) => [eventType, payload])).toEqual([
      [
        EventTypes.EMAIL_DELIVERY_EXHAUSTED,
        expect.objectContaining({ messageId: "1", attempts: 4, actorUserId: null }),
      ],
    ]);
    expect(uow.outcome()).toBe("committed");
  });

  it("a dead replay that fails again stays dead and emits nothing", async () => {
    claims([row({ id: "1", status: "dead", attempts: 6 })]);
    batch = async () => ({ data: null, error: { statusCode: 503, message: "down" } });

    await worker().drainOnce();

    expect(failures().map((f) => f.status)).toEqual(["dead"]);
    expect(enqueuedEvents(outbox)).toEqual([]);
  });

  it("a non-retryable rejection marks failed and emits in the settle's unit of work", async () => {
    claims([row({ id: "1" }), row({ id: "2", toAddress: "bad" })]);
    batch = async () => ({
      data: [{ id: "p0" }],
      errors: [{ index: 1, message: "invalid recipient" }],
      error: null,
    });

    await worker().drainOnce();

    expect(sentIds()).toEqual(["1"]);
    expect(failures()).toEqual([{ lastError: "invalid recipient", status: "failed" }]);
    expect(enqueuedEvents(outbox).map(({ eventType }) => eventType)).toEqual([
      EventTypes.EMAIL_DELIVERY_EXHAUSTED,
    ]);
    expect(failedIn[0]).toBeDefined();
    expect(uow.outcome()).toBe("committed");
  });

  it("a settle that wrote nothing emits nothing", async () => {
    claims([row({ id: "1", attempts: 5 })]);
    batch = async () => ({ data: null, error: { statusCode: 422, message: "rejected" } });
    queue.markFailed.mockResolvedValue(Result.ok(false));

    await worker().drainOnce();

    expect(enqueuedEvents(outbox)).toEqual([]);
  });

  it("stop releases unstarted chunks", async () => {
    claims(Array.from({ length: 150 }, (_, i) => row({ id: String(i) })));
    let deliver: () => void = () => {};
    const firstSend = new Promise<void>((resolve) => {
      deliver = resolve;
    });
    batch = async (entries) => {
      await firstSend;
      return accepted(entries);
    };
    const subject = worker();

    const draining = subject.drainOnce();
    await new Promise((resolve) => setTimeout(resolve, 10));
    const stopping = subject.stop();
    deliver();
    await Promise.all([draining, stopping]);

    expect(sentIds()).toHaveLength(100);
    expect(queue.release.mock.calls.flatMap(([leases]) => leases.map(({ id }) => id))).toEqual(
      Array.from({ length: 50 }, (_, i) => String(100 + i)),
    );
  });
});

describe("EmailDeliveryWorker.start", () => {
  it("logs and reports a first drain that fails instead of crashing the process", async () => {
    const instrumentation = mockInstrumentation();
    queue.claim.mockRejectedValue(new Error("connection refused"));
    const subject = new EmailDeliveryWorker(
      queue,
      outbox,
      uow.unitOfWork,
      logger,
      instrumentation,
      OPTIONS,
      { batchSend: (entries) => batch(entries) },
    );

    await subject.start();
    await new Promise((resolve) => setTimeout(resolve, 10));
    await subject.stop();

    expect(logger.error.mock.calls.map(([, message]) => message)).toContain("email drain failed");
    expect(instrumentation.capture).toHaveBeenCalledTimes(1);
  });
});

describe("resendBatchSender", () => {
  it("aborts a send that outlives its timeout and reports it as a retryable failure", async () => {
    const instrumentation = new NoOpInstrumentation();
    const client = {
      batch: {
        send: (_entries: never, options: { signal: AbortSignal }) =>
          new Promise<{ data: null; error: { message: string; statusCode: number | null } }>(
            (resolve) => {
              options.signal.addEventListener("abort", () =>
                resolve({
                  data: null,
                  error: { message: "Unable to fetch data", statusCode: null },
                }),
              );
            },
          ),
      },
    };

    const result = await resendBatchSender(client, instrumentation, logger, 10).batchSend(
      [{ to: "a@x.test" }],
      Option.none(),
    );

    expect(result.error).toEqual({
      statusCode: 0,
      message: "email batch send timed out after 10ms",
    });
  });
});

describe("chunkIdempotencyKey", () => {
  const keyed = (key: string | null) =>
    row({ idempotencyKey: key === null ? Option.none<string>() : Option.some(key) });

  it("distinguishes key sets that differ only past 256 characters", async () => {
    const prefix = "a".repeat(250);
    const first = await chunkIdempotencyKey([keyed(`${prefix}-one`), keyed(`${prefix}-two`)]);
    const second = await chunkIdempotencyKey([keyed(`${prefix}-one`), keyed(`${prefix}-three`)]);

    expect(first.isSome()).toBe(true);
    expect(second.isSome()).toBe(true);
    expect(first.unwrap()).not.toBe(second.unwrap());
  });

  it("is order-independent", async () => {
    const a = await chunkIdempotencyKey([keyed("k1"), keyed("k2")]);
    const b = await chunkIdempotencyKey([keyed("k2"), keyed("k1")]);
    expect(a.unwrap()).toBe(b.unwrap());
  });

  it("returns none when any row lacks a key", async () => {
    const result = await chunkIdempotencyKey([keyed("k1"), keyed(null)]);
    expect(result.isNone()).toBe(true);
  });
});
