import { beforeEach, describe, expect, it, mock } from "bun:test";
import { type ILogger, Option } from "@packages/ddd-kit";
import * as realDrizzle from "@packages/drizzle";
import { mockPort } from "@packages/test/bun";
import { mockInstrumentation } from "@packages/test/bun/instrumentation";
import { drizzle } from "drizzle-orm/node-postgres";

let rows: () => Promise<unknown[]> = async () => [];
const calls: Array<{ method: string; args: unknown[] }> = [];

function chain(): Record<string, unknown> {
  const node: Record<string, unknown> = {
    toSQL: () => ({ sql: "query", params: [] }),
    execute: () => rows(),
  };
  for (const method of [
    "select",
    "insert",
    "update",
    "delete",
    "with",
    "from",
    "where",
    "set",
    "values",
    "returning",
    "limit",
    "innerJoin",
    "orderBy",
    "onConflictDoNothing",
  ]) {
    node[method] = (...args: unknown[]) => {
      calls.push({ method, args });
      return chain();
    };
  }
  return node;
}

mock.module("@packages/drizzle", () => ({
  ...realDrizzle,
  db: drizzle.mock(),
  resolveExecutor: () => chain(),
}));

const { DrizzleWebhookDeliveryRepository } = await import(
  "../../../infra/repos/drizzle/webhook-delivery.repository"
);

const ROW = {
  id: "del-1",
  endpointId: "ep-1",
  outboxEventId: "out-1",
  eventType: "user.created",
  payload: { foo: "bar" },
  status: "pending",
  attempts: 0,
  nextAttemptAt: null,
  lastError: null,
  lastResponseStatus: null,
  idempotencyKey: "out-1:ep-1",
  createdAt: new Date("2024-01-01"),
};

const argsOf = (method: string) => calls.filter((c) => c.method === method).map((c) => c.args);
const firstArgOf = (method: string) => argsOf(method)[0]?.[0];

function given() {
  const instrumentation = mockInstrumentation();
  const repository = new DrizzleWebhookDeliveryRepository(instrumentation, mockPort<ILogger>());

  return { instrumentation, repository };
}

beforeEach(() => {
  rows = async () => [];
  calls.length = 0;
});

describe("webhook delivery repository", () => {
  it("hands the claimed deliveries back oldest first", async () => {
    rows = async () => [{ ...ROW, id: "del-2", createdAt: new Date("2024-01-02") }, ROW];
    const { repository } = given();

    const claimed = await repository.claim({ limit: 10, leaseSeconds: 330 });

    expect(claimed.isSuccess && claimed.getValue().map((d) => d.id)).toEqual(["del-1", "del-2"]);
  });

  it("reports whether a settle wrote, so a lost lease writes nothing downstream", async () => {
    const lease = { id: "del-1", attempts: 1 };
    const failure = {
      lastError: "HTTP 500",
      lastResponseStatus: Option.some(500),
      status: "failed" as const,
      retryAfterSeconds: Option.some(3),
    };
    const { repository } = given();

    rows = async () => [{ id: "del-1" }];
    const wrote = [
      await repository.markSuccess(lease, Option.some(200)),
      await repository.markFailed(lease, failure),
      await repository.release(lease),
    ];
    rows = async () => [];
    const skipped = [
      await repository.markSuccess(lease, Option.some(200)),
      await repository.markFailed(lease, failure),
      await repository.release(lease),
    ];

    expect(wrote.map((r) => r.isSuccess && r.getValue())).toEqual([true, true, true]);
    expect(skipped.map((r) => r.isSuccess && r.getValue())).toEqual([false, false, false]);
  });

  it("enqueues fan-out deliveries due now that a redelivered event never doubles", async () => {
    const { repository } = given();

    const enqueued = await repository.enqueueFanout([
      {
        endpointId: "ep-1",
        outboxEventId: "out-1",
        eventType: "user.created",
        payload: { foo: "bar" },
        idempotencyKey: "out-1:ep-1",
      },
    ]);

    expect(enqueued.isSuccess).toBe(true);
    const values = firstArgOf("values");
    expect(values).toMatchObject([
      {
        endpointId: "ep-1",
        outboxEventId: "out-1",
        status: "pending",
        attempts: 0,
        nextAttemptAt: realDrizzle.dbNow,
        idempotencyKey: "out-1:ep-1",
      },
    ]);
    expect(argsOf("onConflictDoNothing")).toHaveLength(1);
  });

  it("stores an attempt with every absent value as null", async () => {
    const { repository } = given();

    await repository.createAttempt({
      deliveryId: "del-1",
      attemptNumber: 1,
      requestHeaders: Option.none(),
      requestBody: Option.none(),
      responseStatus: Option.some(500),
      responseHeaders: Option.none(),
      responseBody: Option.none(),
      durationMs: Option.some(0),
      error: Option.some("HTTP 500: Internal Server Error"),
    });

    const values = firstArgOf("values");
    expect(values).toMatchObject({
      deliveryId: "del-1",
      requestHeaders: null,
      responseStatus: 500,
      durationMs: 0,
      error: "HTTP 500: Internal Server Error",
    });
  });

  it("surfaces a database failure to telemetry and returns it instead of throwing", async () => {
    const boom = new Error("connection reset");
    rows = async () => {
      throw boom;
    };
    const { instrumentation, repository } = given();

    const claimed = await repository.claim({ limit: 10, leaseSeconds: 330 });

    expect(claimed.isFailure && claimed.getError().code).toBe(
      "WEBHOOK_PERSISTENCE_PROVIDER_FAILURE",
    );
    expect(instrumentation.capture).toHaveBeenCalledWith(boom);
  });
});
