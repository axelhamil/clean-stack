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

mock.module("@packages/drizzle", () => ({
  ...realDrizzle,
  db: {
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
  },
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
    const tx = {
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
    const result = await queue.enqueue(
      [
        {
          kind: "raw",
          template: Option.none(),
          toAddress: "a@x.test",
          subject: "s",
          locale: "en",
          payload: {},
          idempotencyKey: Option.none(),
        },
      ],
      tx as never,
    );
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

describe("DrizzleEmailQueue.markSent", () => {
  it("issues a single statement for many ids", async () => {
    const updates: unknown[] = [];
    const tx = {
      update: () => ({
        set: () => ({
          where: () => ({
            toSQL: () => ({ sql: "update" }),
            execute: async () => {
              updates.push(1);
            },
          }),
        }),
      }),
    };

    const result = await new DrizzleEmailQueue(new NoOpInstrumentation()).markSent(
      ["a", "b", "c"],
      new Date(),
      { a: "p1", b: "p2" },
      tx as never,
    );

    expect(result.isSuccess).toBe(true);
    expect(updates).toHaveLength(1);
  });

  it("is a no-op for an empty id list", async () => {
    let called = false;
    const tx = {
      update: () => {
        called = true;
        return {} as never;
      },
    };

    const result = await new DrizzleEmailQueue(new NoOpInstrumentation()).markSent(
      [],
      new Date(),
      {},
      tx as never,
    );

    expect(result.isSuccess).toBe(true);
    expect(called).toBe(false);
  });
});

describe("DrizzleEmailQueue.markFailed", () => {
  function recordingTx() {
    const sets: Array<{ status: string; nextAttemptAt: Date | null }> = [];
    const tx = {
      update: () => ({
        set: (values: { status: string; nextAttemptAt: Date | null }) => {
          sets.push(values);
          return {
            where: () => ({
              toSQL: () => ({ sql: "update email_message" }),
              execute: async () => undefined,
            }),
          };
        },
      }),
    };
    return { tx, sets };
  }

  it("parks the row as failed when no further attempt is scheduled", async () => {
    const { tx, sets } = recordingTx();

    const result = await new DrizzleEmailQueue(new NoOpInstrumentation()).markFailed(
      "m1",
      "HTTP 422",
      Option.none(),
      tx as never,
    );

    expect(result.isSuccess).toBe(true);
    expect(sets[0]?.status).toBe("failed");
    expect(sets[0]?.nextAttemptAt).toBeNull();
  });

  it("keeps the row pending until the scheduled retry", async () => {
    const { tx, sets } = recordingTx();
    const retryAt = new Date("2026-08-04T00:05:00Z");

    await new DrizzleEmailQueue(new NoOpInstrumentation()).markFailed(
      "m1",
      "HTTP 503",
      Option.some(retryAt),
      tx as never,
    );

    expect(sets[0]?.status).toBe("pending");
    expect(sets[0]?.nextAttemptAt).toEqual(retryAt);
  });
});
