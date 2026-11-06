import { beforeEach, describe, expect, it } from "bun:test";
import {
  type IInstrumentation,
  type ILogger,
  Option,
  Result,
  UnitOfWorkContext,
} from "@packages/ddd-kit";
import { EventTypes } from "@packages/events";
import type { Locale } from "@packages/i18n";
import type { IOutboxRepository } from "@packages/outbox/outbox.port";
import { enqueuedEvents } from "@packages/outbox/testing/enqueued-events";
import { mockPort, type PortMock } from "@packages/test/bun";
import { mockInstrumentation } from "@packages/test/bun/instrumentation";
import { mockUnitOfWork, type UnitOfWorkMock } from "@packages/test/bun/unit-of-work";
import type { ErrorResponse } from "resend";
import type {
  EmailFailure,
  EmailLease,
  EmailMessageRecord,
  IEmailQueue,
} from "../email-queue.port";

// `@packages/emails` is intentionally NOT mocked here: nothing in this file asserts
// on rendered content (only on which row got claimed/sent), so exercising the real
// renderer is both cheaper than a stub and closer to what ships.

const { EmailDeliveryWorker, chunkBatchKey, chunkIdempotencyKey, groupRows, resendBatchSender } =
  await import("../email-delivery-worker");

const OPTIONS = { leaseSeconds: 120, deadRetrySeconds: 21_600, deadReplayWindowHours: 24 };

type BatchResult = {
  data: Array<{ id: string }> | null;
  errors?: Array<{ index: number; message: string }>;
  error: null | {
    kind: "retryable" | "in_flight" | "conflict" | "rejected";
    statusCode: number;
    message: string;
  };
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
  batchKey: Option.none<string>(),
  unsettledInBatch: Option.none<number>(),
  createdAt: new Date("2026-08-04T00:00:00Z"),
  ...over,
});

const logger = mockPort<ILogger>();
let queue: PortMock<IEmailQueue>;
let outbox: PortMock<IOutboxRepository>;
let uow: UnitOfWorkMock;
let batch: (entries: unknown[], idempotencyKey: Option<string>) => Promise<BatchResult>;
let failedIn: unknown[];
let assigned: Map<string, string>;
let now: number;

const accepted = async (entries: unknown[]): Promise<BatchResult> => ({
  data: entries.map((_, i) => ({ id: `provider-${i}` })),
  error: null,
});

function claims(rows: EmailMessageRecord[]): void {
  queue.claim.mockResolvedValue(Result.ok(rows));
}

function worker(
  options = OPTIONS,
  clock = () => now,
  instrumentation: IInstrumentation = mockInstrumentation(),
) {
  return new EmailDeliveryWorker(
    queue,
    outbox,
    uow.unitOfWork,
    logger,
    instrumentation,
    options,
    { batchSend: (entries, idempotencyKey) => batch(entries, idempotencyKey) },
    clock,
  );
}

const failures = (): EmailFailure[] =>
  queue.markFailed.mock.calls.flatMap(([leases, failure]) => leases.map(() => failure));
const failureById = () =>
  Object.fromEntries(
    queue.markFailed.mock.calls.flatMap(([leases, failure]) =>
      leases.map(({ id }) => [id, failure]),
    ),
  );
const releasedIds = () =>
  queue.release.mock.calls.flatMap(([leases]) => leases.map(({ id }) => id));
const sentIds = () => queue.markSent.mock.calls.flatMap(([leases]) => leases.map(({ id }) => id));

beforeEach(() => {
  queue = mockPort<IEmailQueue>();
  outbox = mockPort<IOutboxRepository>();
  uow = mockUnitOfWork();
  batch = accepted;
  failedIn = [];
  assigned = new Map();
  now = 0;
  queue.assignBatch.mockImplementation(async (leases: EmailLease[], batchKey: string) => {
    for (const { id } of leases) assigned.set(id, batchKey);
    return Result.ok(leases);
  });
  queue.markSent.mockImplementation(async (leases: EmailLease[]) => Result.ok(leases));
  queue.markFailed.mockImplementation(async (leases: EmailLease[]) => {
    failedIn.push(UnitOfWorkContext.transaction());
    return Result.ok(leases);
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
    batch = async () => ({
      data: null,
      error: { kind: "retryable", statusCode: 0, message: "timed out" },
    });

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
    batch = async () => ({
      data: null,
      error: { kind: "retryable", statusCode: 429, message: "rate limited" },
    });

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
    batch = async () => ({
      data: null,
      error: { kind: "retryable", statusCode: 503, message: "down" },
    });

    await worker().drainOnce();

    expect(failures().map((f) => f.status)).toEqual(["pending"]);
    expect(enqueuedEvents(outbox)).toEqual([]);
  });

  it("exhausted retries mark the row dead on the fourth send and emit EMAIL_DELIVERY_EXHAUSTED once", async () => {
    claims([row({ id: "1", attempts: 4 })]);
    batch = async () => ({
      data: null,
      error: { kind: "retryable", statusCode: 503, message: "down" },
    });

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
    batch = async () => ({
      data: null,
      error: { kind: "retryable", statusCode: 503, message: "down" },
    });

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
    batch = async () => ({
      data: null,
      error: { kind: "rejected", statusCode: 422, message: "rejected" },
    });
    queue.markFailed.mockResolvedValue(Result.ok([]));

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
      { batchSend: (entries, idempotencyKey) => batch(entries, idempotencyKey) },
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
    const instrumentation = mockInstrumentation();
    const client = {
      batch: {
        send: (_entries: never, options: { signal: AbortSignal }) =>
          new Promise<{ data: null; error: ErrorResponse }>((resolve) => {
            options.signal.addEventListener("abort", () =>
              resolve({
                data: null,
                error: {
                  message: "Unable to fetch data",
                  statusCode: null,
                  name: "application_error",
                },
              }),
            );
          }),
      },
    };

    const result = await resendBatchSender(client, instrumentation, logger, 10).batchSend(
      [{ to: "a@x.test" }],
      Option.none(),
    );

    expect(result.error).toEqual({
      kind: "retryable",
      statusCode: 0,
      message: "email batch send timed out after 10ms",
    });
  });

  it("maps each provider error to the outcome the worker acts on", async () => {
    type Kind = "retryable" | "in_flight" | "conflict" | "rejected";
    const cases: [ErrorResponse, Kind][] = [
      [{ message: "m", statusCode: 409, name: "concurrent_idempotent_requests" }, "in_flight"],
      [{ message: "m", statusCode: 409, name: "invalid_idempotent_request" }, "conflict"],
      [{ message: "m", statusCode: 429, name: "rate_limit_exceeded" }, "retryable"],
      [{ message: "m", statusCode: null, name: "application_error" }, "retryable"],
      [{ message: "m", statusCode: 422, name: "validation_error" }, "rejected"],
    ];

    const kinds = await Promise.all(
      cases.map(async ([error]) => {
        const client = { batch: { send: async () => ({ data: null, error }) } };
        const result = await resendBatchSender(client, mockInstrumentation(), logger).batchSend(
          [{ to: "a@x.test" }],
          Option.some("key"),
        );
        return result.error?.kind;
      }),
    );

    expect(kinds).toEqual(cases.map(([, kind]) => kind));
  });
});

describe("chunkBatchKey", () => {
  it("is the same for the same rows in any order", async () => {
    const a = await chunkBatchKey([row({ id: "a" }), row({ id: "b" })]);
    const b = await chunkBatchKey([row({ id: "b" }), row({ id: "a" })]);

    expect(a).toBe(b);
  });

  it("changes when one row changes", async () => {
    const a = await chunkBatchKey([row({ id: "a" }), row({ id: "b" })]);
    const b = await chunkBatchKey([row({ id: "a" }), row({ id: "c" })]);

    expect(a).not.toBe(b);
  });

  it("exists even when no row carries an enqueue idempotency key", async () => {
    const key = await chunkBatchKey([row({ id: "a" })]);

    expect(key).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("chunkIdempotencyKey", () => {
  const entries = [
    { from: "a@x.test", to: "b@x.test", template: { id: "t", variables: { n: 1 } } },
  ];

  it("is the same for the same batch and the same content, whatever the key order", async () => {
    const a = await chunkIdempotencyKey("batch", entries);
    const b = await chunkIdempotencyKey("batch", [
      { template: { variables: { n: 1 }, id: "t" }, to: "b@x.test", from: "a@x.test" },
    ]);

    expect(a).toBe(b);
  });

  it("changes when the content sent changes under the same batch", async () => {
    const a = await chunkIdempotencyKey("batch", entries);
    const b = await chunkIdempotencyKey("batch", [{ ...entries[0], from: "c@x.test" }]);

    expect(a).not.toBe(b);
  });

  it("changes when the batch changes", async () => {
    const a = await chunkIdempotencyKey("batch", entries);
    const b = await chunkIdempotencyKey("other", entries);

    expect(a).not.toBe(b);
  });
});

describe("groupRows", () => {
  it("keeps the rows of a failed batch together, apart from rows of the same template", () => {
    const groups = groupRows([
      row({ id: "1", batchKey: Option.some("k") }),
      row({ id: "2" }),
      row({ id: "3", batchKey: Option.some("k") }),
    ]);

    expect(groups.map((group) => group.map(({ id }) => id))).toEqual([["1", "3"], ["2"]]);
  });

  it("never mixes live and dead rows, nor rows with different attempts", () => {
    const groups = groupRows([
      row({ id: "1", attempts: 1 }),
      row({ id: "2", attempts: 6, status: "dead" }),
      row({ id: "3", attempts: 2 }),
      row({ id: "4", attempts: 1 }),
    ]);

    expect(groups.map((group) => group.map(({ id }) => id))).toEqual([["1", "4"], ["2"], ["3"]]);
  });
});

describe("EmailDeliveryWorker batch replay", () => {
  const keys: string[] = [];
  const unavailable = async (_entries: unknown[], idempotencyKey: Option<string>) => {
    keys.push(idempotencyKey.unwrapOr("none"));
    return { data: null, error: { kind: "retryable" as const, statusCode: 503, message: "down" } };
  };
  const rejectedAs = (kind: "in_flight" | "conflict") => async () => ({
    data: null,
    error: { kind, statusCode: 409, message: "idempotency" },
  });

  beforeEach(() => {
    keys.length = 0;
  });

  it("settles a whole-chunk retryable failure once for every row", async () => {
    const chunk = [row({ id: "1" }), row({ id: "2" }), row({ id: "3" })];
    claims(chunk);
    batch = unavailable;

    await worker().drainOnce();

    expect(new Set(failures().map((f) => f.status))).toEqual(new Set(["pending"]));
    expect(
      new Set(failures().map((f) => (f.status === "failed" ? 0 : f.retryAfterSeconds))).size,
    ).toBe(1);
  });

  it("persists the batch key on every row of the chunk before the provider sees it", async () => {
    const chunk = [row({ id: "1" }), row({ id: "2" })];
    claims(chunk);
    let persistedAtSend: [string, string][] = [];
    batch = async (entries) => {
      persistedAtSend = [...assigned.entries()];
      return accepted(entries);
    };

    await worker().drainOnce();

    const batchKey = await chunkBatchKey(chunk);
    expect(persistedAtSend).toEqual([
      ["1", batchKey],
      ["2", batchKey],
    ]);
  });

  it("sends nothing and releases the chunk when the batch key cannot be persisted", async () => {
    claims([row({ id: "1" }), row({ id: "2" })]);
    queue.assignBatch.mockResolvedValue(
      Result.fail({ code: "EMAIL_QUEUE_WRITE_FAILED", message: "db down" }),
    );
    batch = unavailable;

    await worker().drainOnce();

    expect(keys).toEqual([]);
    expect(queue.release.mock.calls.flatMap(([leases]) => leases.map(({ id }) => id))).toEqual([
      "1",
      "2",
    ]);
  });

  it("sends nothing when part of the chunk lost its lease before the key was persisted", async () => {
    claims([row({ id: "1" }), row({ id: "2" })]);
    queue.assignBatch.mockImplementation(async (leases: EmailLease[]) =>
      Result.ok(leases.slice(0, 1)),
    );
    batch = unavailable;

    await worker().drainOnce();

    expect(keys).toEqual([]);
    expect(failures()).toEqual([]);
  });

  it("settles every row of the failed chunk in one write so they come due together", async () => {
    claims([row({ id: "1" }), row({ id: "2" })]);
    batch = unavailable;

    await worker().drainOnce();

    expect(queue.markFailed.mock.calls.map(([leases]) => leases.map(({ id }) => id))).toEqual([
      ["1", "2"],
    ]);
    expect(failedIn[0]).toBeDefined();
  });

  it("announces every row a whole-chunk rejection settled, and only those", async () => {
    claims([row({ id: "1" }), row({ id: "2" })]);
    batch = async () => ({
      data: null,
      error: { kind: "rejected", statusCode: 422, message: "rejected" },
    });
    queue.markFailed.mockImplementation(async (leases: EmailLease[]) => Result.ok(leases.slice(1)));

    await worker().drainOnce();

    expect(enqueuedEvents(outbox).map(({ payload }) => payload)).toEqual([
      expect.objectContaining({ messageId: "2" }),
    ]);
  });

  it("decides a batch's fate from its highest attempts so a batch never splits", async () => {
    claims([
      row({ id: "1", attempts: 1, batchKey: Option.some("k") }),
      row({ id: "2", attempts: 4, batchKey: Option.some("k") }),
    ]);
    batch = unavailable;

    await worker().drainOnce();

    expect(failures().map((f) => f.status)).toEqual(["dead", "dead"]);
  });

  it("keeps a fresh row pending when a dead row of the same template fails beside it", async () => {
    claims([row({ id: "1", attempts: 1 }), row({ id: "2", attempts: 6, status: "dead" })]);
    batch = unavailable;

    await worker().drainOnce();

    expect(failureById()["1"]?.status).toBe("pending");
    expect(failureById()["2"]?.status).toBe("dead");
    expect(enqueuedEvents(outbox)).toEqual([]);
  });

  it("replays a failed batch with the same rows and the same key, apart from other rows", async () => {
    const chunk = [row({ id: "1" }), row({ id: "2" }), row({ id: "3" })];
    claims(chunk);
    batch = unavailable;
    await worker().drainOnce();
    const [firstKey = ""] = keys;
    const requests: Array<{ ids: unknown[]; key: string }> = [];
    claims([
      ...chunk.map((r) => ({
        ...r,
        attempts: 2,
        batchKey: Option.fromNullable(assigned.get(r.id)),
      })),
      row({ id: "4" }),
    ]);
    batch = async (entries, idempotencyKey) => {
      requests.push({ ids: entries, key: idempotencyKey.unwrapOr("none") });
      return accepted(entries);
    };

    await worker().drainOnce();

    expect(requests.map(({ ids, key }) => [ids.length, key])).toEqual([
      [3, firstKey],
      [1, expect.any(String)],
    ]);
  });

  it("keys the chunk on the rows actually sent and leaves a render failure without a batch key", async () => {
    const sendable = [row({ id: "2" }), row({ id: "3" })];
    claims([row({ id: "1", template: Option.some("no_such_template") }), ...sendable]);
    batch = unavailable;

    await worker().drainOnce();

    const batchKey = await chunkBatchKey(sendable);
    expect(failures()[0]).toEqual({
      lastError: expect.stringContaining("render failed"),
      status: "failed",
    });
    expect([...assigned.entries()]).toEqual([
      ["2", batchKey],
      ["3", batchKey],
    ]);
  });

  it("puts a batch the provider is still processing back a minute later, without spending an attempt nor announcing", async () => {
    claims([row({ id: "1", attempts: 4 }), row({ id: "2", attempts: 4 })]);
    batch = rejectedAs("in_flight");

    await worker().drainOnce();

    expect(failures()).toEqual([]);
    expect(queue.release.mock.calls).toEqual([
      [
        [
          expect.objectContaining({ id: "1", attempts: 4 }),
          expect.objectContaining({ id: "2", attempts: 4 }),
        ],
        60,
      ],
    ]);
    expect(enqueuedEvents(outbox)).toEqual([]);
  });

  it("fails loudly when the provider refuses a changed payload under the same key", async () => {
    const instrumentation = mockInstrumentation();
    claims([row({ id: "1" })]);
    batch = rejectedAs("conflict");

    await worker(OPTIONS, () => now, instrumentation).drainOnce();

    expect(failures()).toEqual([
      {
        status: "failed",
        lastError: expect.stringContaining("different payload"),
      },
    ]);
    expect(instrumentation.capture).toHaveBeenCalledTimes(1);
    expect(enqueuedEvents(outbox).map(({ eventType }) => eventType)).toEqual([
      EventTypes.EMAIL_DELIVERY_EXHAUSTED,
    ]);
  });

  it("releases a batch the claim brought back incomplete, never sending it under another key", async () => {
    const split = { batchKey: Option.some("k"), unsettledInBatch: Option.some(3) };
    claims([row({ id: "1", ...split }), row({ id: "2", ...split }), row({ id: "3" })]);
    const requests: number[] = [];
    batch = async (entries) => {
      requests.push(entries.length);
      return accepted(entries);
    };

    await worker().drainOnce();

    expect(requests).toEqual([1]);
    expect(sentIds()).toEqual(["3"]);
    expect(releasedIds()).toEqual(["1", "2"]);
    expect([...assigned.keys()]).toEqual(["3"]);
    expect(logger.warn.mock.calls.map(([, message]) => message)).toContain(
      "email batch claimed incomplete, released until its siblings are free",
    );
  });

  it("sends a whole batch under the batch key it already carries", async () => {
    const whole = { batchKey: Option.some("k"), unsettledInBatch: Option.some(2) };
    claims([row({ id: "1", ...whole }), row({ id: "2", ...whole })]);

    await worker().drainOnce();

    expect([...assigned.values()]).toEqual(["k", "k"]);
    expect(sentIds()).toEqual(["1", "2"]);
  });
});
