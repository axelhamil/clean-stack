import { describe, expect, it, mock } from "bun:test";
import { NoOpInstrumentation } from "../../../shared/services/noop-instrumentation";
import { DrizzleQuotaUsageStore } from "../infrastructure/repositories/drizzle-quota-usage.store";

const period = { start: new Date(0), end: new Date("9999-12-31T00:00:00Z") };

// Fake query object: has toSQL() + execute() as required by §8 inner-span pattern
function fakeQuery(rows: unknown[]) {
  return {
    toSQL: () => ({ sql: "select used from quota_usage where ..." }),
    execute: () => Promise.resolve(rows),
  };
}

function failingQuery(err: Error) {
  return {
    toSQL: () => ({ sql: "select used from quota_usage where ..." }),
    execute: () => Promise.reject(err),
  };
}

describe("DrizzleQuotaUsageStore.current", () => {
  it("returns 0 when no row exists (Result.ok)", async () => {
    const q = fakeQuery([]);
    const fakeTx = {
      select: () => ({ from: () => ({ where: () => q }) }),
    } as never;
    const store = new DrizzleQuotaUsageStore(new NoOpInstrumentation());
    const res = await store.current("org1", "uploads", period, fakeTx);
    expect(res.isSuccess).toBe(true);
    expect(res.getValue()).toBe(0);
  });

  it("captures + fails closed on a store error", async () => {
    const capture = mock(() => undefined);
    // Object.assign keeps prototype methods (startSpan) and shadows capture with the spy
    const instrumentation = Object.assign(new NoOpInstrumentation(), { capture });
    const q = failingQuery(new Error("db down"));
    const fakeTx = {
      select: () => ({
        from: () => ({
          where: () => q,
        }),
      }),
    } as never;
    const store = new DrizzleQuotaUsageStore(instrumentation);
    const res = await store.current("org1", "uploads", period, fakeTx);
    expect(res.isFailure).toBe(true);
    expect(capture).toHaveBeenCalled();
  });
});
