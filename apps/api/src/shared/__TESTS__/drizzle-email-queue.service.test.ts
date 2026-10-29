import { beforeEach, describe, expect, it, mock } from "bun:test";
import { Option } from "@packages/ddd-kit";
import * as realDrizzle from "@packages/drizzle";

const inserted: unknown[] = [];

// Set by a test to make the insert report fewer written rows than requested.
let insertReturns: ((rows: unknown[]) => unknown[]) | null = null;

const warnSpy = mock(() => {});
mock.module("../logger", () => ({
  logger: { warn: warnSpy, info: mock(() => {}), error: mock(() => {}), debug: mock(() => {}) },
}));

const fakeDb = {
  insert: () => ({
    values: (rows: unknown[]) => {
      inserted.push(...rows);
      const written = insertReturns ? insertReturns(rows) : rows.map(() => ({ id: "id" }));
      const chain = {
        onConflictDoNothing: () => chain,
        returning: () => chain,
        toSQL: () => ({ sql: "insert into email_message" }),
        execute: async () => written,
      };
      return chain;
    },
  }),
};
let executor: unknown = fakeDb;

mock.module("@packages/drizzle", () => ({
  ...realDrizzle,
  resolveExecutor: () => executor,
}));

const { DrizzleEmailQueue } = await import("../services/drizzle-email-queue.service");
const { NoOpInstrumentation } = await import("../services/noop-instrumentation");

const rowFixture = (to: string) => ({
  kind: "template" as const,
  template: Option.some("delete_completed"),
  toAddress: to,
  subject: "s",
  locale: "en" as const,
  payload: { name: "Ada" },
  idempotencyKey: Option.some(`k/${to}`),
});

describe("DrizzleEmailQueue.enqueue", () => {
  beforeEach(() => {
    insertReturns = null;
    executor = fakeDb;
    inserted.length = 0;
    warnSpy.mockClear();
  });

  it("assigns an id and pending status to every row", async () => {
    const queue = new DrizzleEmailQueue(new NoOpInstrumentation());
    const result = await queue.enqueue([
      {
        kind: "template",
        template: Option.some("verify_email"),
        toAddress: "a@x.test",
        subject: "s",
        locale: "en",
        payload: {},
        idempotencyKey: Option.none(),
      },
    ]);
    expect(result.isSuccess).toBe(true);
    expect(result.isSuccess && result.getValue().written).toBe(1);
    expect(inserted).toHaveLength(1);
    expect((inserted[0] as { status: string }).status).toBe("pending");
    expect((inserted[0] as { id: string }).id).toBeTruthy();
  });

  it("reports written: 0 for an empty batch", async () => {
    const queue = new DrizzleEmailQueue(new NoOpInstrumentation());
    const result = await queue.enqueue([]);
    expect(result.isSuccess).toBe(true);
    expect(result.isSuccess && result.getValue().written).toBe(0);
  });

  it("returns a failure Result instead of throwing when the insert rejects", async () => {
    const queue = new DrizzleEmailQueue(new NoOpInstrumentation());
    executor = {
      insert: () => ({
        values: () => ({
          onConflictDoNothing: () => ({
            returning: () => ({
              toSQL: () => ({ sql: "insert into email_message" }),
              execute: async () => {
                throw new Error("db down");
              },
            }),
          }),
        }),
      }),
    };
    const result = await queue.enqueue([
      {
        kind: "raw",
        template: Option.none(),
        toAddress: "a@x.test",
        subject: "s",
        locale: "en",
        payload: {},
        idempotencyKey: Option.none(),
      },
    ]);
    expect(result.isFailure).toBe(true);
    expect(result.getError().code).toBe("EMAIL_QUEUE_WRITE_FAILED");
  });

  it("suppresses a duplicate row instead of failing the whole batch", async () => {
    insertReturns = (rows) => rows.slice(1).map(() => ({ id: "id" })); // one row dropped
    const queue = new DrizzleEmailQueue(new NoOpInstrumentation());

    const result = await queue.enqueue([rowFixture("a@x.test"), rowFixture("b@x.test")]);

    expect(result.isSuccess).toBe(true);
    expect(result.isSuccess && result.getValue().written).toBe(1);
  });

  it("warns when fewer rows are written than requested", async () => {
    insertReturns = (rows) => rows.slice(1).map(() => ({ id: "id" }));

    await new DrizzleEmailQueue(new NoOpInstrumentation()).enqueue([
      rowFixture("a@x.test"),
      rowFixture("b@x.test"),
    ]);

    expect(warnSpy).toHaveBeenCalledTimes(1);
  });
});

function chainResolving(rows: () => Promise<unknown[]>): unknown {
  const chain: unknown = new Proxy(
    {},
    {
      get(_target, property) {
        if (property === "then") return undefined;
        if (property === "toSQL") return () => ({ sql: "update email_message" });
        if (property === "execute") return rows;
        return () => chain;
      },
    },
  );
  return chain;
}

const lease = { id: "m1", attempts: 1 };

describe("DrizzleEmailQueue.claim", () => {
  beforeEach(() => {
    executor = fakeDb;
  });

  it("claim returns a failure Result when the query rejects", async () => {
    executor = chainResolving(async () => {
      throw new Error("db down");
    });

    const result = await new DrizzleEmailQueue(new NoOpInstrumentation()).claim({
      limit: 10,
      leaseSeconds: 120,
      deadReplayWindowHours: 24,
    });

    expect(result.isFailure).toBe(true);
    expect(result.getError().message).toBe("db down");
  });
});

describe("DrizzleEmailQueue.markSent", () => {
  it("markSent is a no-op for an empty lease list", async () => {
    let called = false;
    executor = {
      update: () => {
        called = true;
        return chainResolving(async () => []);
      },
    };

    const result = await new DrizzleEmailQueue(new NoOpInstrumentation()).markSent([], {});

    expect(result.isSuccess && result.getValue()).toEqual([]);
    expect(called).toBe(false);
  });
});

describe("DrizzleEmailQueue.markFailed", () => {
  it("markFailed reports whether it wrote", async () => {
    const queue = new DrizzleEmailQueue(new NoOpInstrumentation());
    const failure = { lastError: "HTTP 503", status: "pending", retryAfterSeconds: 3 } as const;

    executor = chainResolving(async () => [{ id: "m1" }]);
    const written = await queue.markFailed(lease, failure);
    executor = chainResolving(async () => []);
    const stale = await queue.markFailed(lease, failure);

    expect(written.isSuccess && written.getValue()).toBe(true);
    expect(stale.isSuccess && stale.getValue()).toBe(false);
  });
});
