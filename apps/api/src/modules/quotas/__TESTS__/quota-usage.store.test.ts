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

// Fake insert chain: insert(...).values(...).onConflictDoUpdate(...).returning(...) → { toSQL, execute }
function fakeInsertChain(rows: unknown[]) {
  const q = {
    toSQL: () => ({ sql: "insert into quota_usage ... on conflict do update ... returning used" }),
    execute: () => Promise.resolve(rows),
  };
  const withReturning = { returning: () => q };
  const withOnConflict = { onConflictDoUpdate: () => withReturning };
  const withValues = { values: () => withOnConflict };
  return { insert: () => withValues };
}

function failingInsertChain(err: Error) {
  const q = {
    toSQL: () => ({ sql: "insert into quota_usage ... on conflict do update ... returning used" }),
    execute: () => Promise.reject(err),
  };
  const withReturning = { returning: () => q };
  const withOnConflict = { onConflictDoUpdate: () => withReturning };
  const withValues = { values: () => withOnConflict };
  return { insert: () => withValues };
}

describe("DrizzleQuotaUsageStore.increment", () => {
  it("returns the stored used value on success (Result.ok)", async () => {
    const fakeTx = fakeInsertChain([{ used: 7 }]) as never;
    const store = new DrizzleQuotaUsageStore(new NoOpInstrumentation());
    const res = await store.increment("org1", "uploads", 3, period, fakeTx);
    expect(res.isSuccess).toBe(true);
    expect(res.getValue()).toBe(7);
  });

  it("captures + fails closed on a store error", async () => {
    const capture = mock(() => undefined);
    const instrumentation = Object.assign(new NoOpInstrumentation(), { capture });
    const fakeTx = failingInsertChain(new Error("db down")) as never;
    const store = new DrizzleQuotaUsageStore(instrumentation);
    const res = await store.increment("org1", "uploads", 3, period, fakeTx);
    expect(res.isFailure).toBe(true);
    expect(capture).toHaveBeenCalled();
  });
});

// Fake update chain: update(...).set(...).where(...) → { toSQL, execute }
function fakeResetChain() {
  const q = {
    toSQL: () => ({ sql: "update quota_usage set used = 0 where ..." }),
    execute: () => Promise.resolve([]),
  };
  const withWhere = { where: () => q };
  const withSet = { set: () => withWhere };
  return { update: () => withSet };
}

function failingResetChain(err: Error) {
  const q = {
    toSQL: () => ({ sql: "update quota_usage set used = 0 where ..." }),
    execute: () => Promise.reject(err),
  };
  const withWhere = { where: () => q };
  const withSet = { set: () => withWhere };
  return { update: () => withSet };
}

describe("DrizzleQuotaUsageStore.reset", () => {
  it("returns Result.ok on success", async () => {
    const fakeTx = fakeResetChain() as never;
    const store = new DrizzleQuotaUsageStore(new NoOpInstrumentation());
    const res = await store.reset("org1", "uploads", period, fakeTx);
    expect(res.isSuccess).toBe(true);
  });

  it("captures + fails closed on a store error", async () => {
    const capture = mock(() => undefined);
    const instrumentation = Object.assign(new NoOpInstrumentation(), { capture });
    const fakeTx = failingResetChain(new Error("db down")) as never;
    const store = new DrizzleQuotaUsageStore(instrumentation);
    const res = await store.reset("org1", "uploads", period, fakeTx);
    expect(res.isFailure).toBe(true);
    expect(capture).toHaveBeenCalled();
  });
});

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
