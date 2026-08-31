import { mock } from "bun:test";
import { drizzleMock } from "./drizzle-mock";

const leaseQuery = (rows: Array<{ label: string }>) => {
  const q = {
    values: () => q,
    onConflictDoUpdate: () => q,
    where: () => q,
    returning: () => q,
    toSQL: () => ({ sql: 'insert into "sweep_lock" … on conflict do update' }),
    execute: async () => rows,
  };
  return q;
};

mock.module("@packages/drizzle", () => ({
  ...drizzleMock(),
  db: {
    insert: () => leaseQuery([{ label: "sweep-x" }]),
    delete: () => leaseQuery([]),
  },
}));

const { describe, expect, it, spyOn } = await import("bun:test");
const { NoOpInstrumentation } = await import("../../services/noop-instrumentation");
const { sweepSpans } = await import("../sweep-span");
const { sweepLockFor } = await import("../sweep-lock");

describe("sweepLockFor", () => {
  it("opens a db span for the acquire", async () => {
    const instrumentation = new NoOpInstrumentation();
    const spy = spyOn(instrumentation, "startSpan");
    const lock = sweepLockFor("sweep-x", sweepSpans(instrumentation));

    await lock.acquire();

    expect(spy).toHaveBeenCalledWith(
      expect.objectContaining({ op: "db.query" }),
      expect.any(Function),
    );
  });

  it("opens a db span for the release, and none when nothing was acquired", async () => {
    const instrumentation = new NoOpInstrumentation();
    const lock = sweepLockFor("sweep-x", sweepSpans(instrumentation));
    const spy = spyOn(instrumentation, "startSpan");

    await lock.release();
    expect(spy).not.toHaveBeenCalled();

    await lock.acquire();
    spy.mockClear();
    await lock.release();
    expect(spy).toHaveBeenCalledTimes(1);
  });
});
