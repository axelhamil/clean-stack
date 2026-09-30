import { describe, expect, it, mock } from "bun:test";
import { NoOpInstrumentation } from "../../../shared/services/noop-instrumentation";
import { DrizzleQuotaUsageStore } from "../infrastructure/repositories/drizzle-quota-usage.store";

const period = { start: new Date(0), end: new Date("9999-12-31T00:00:00Z") };

type Execute = () => Promise<unknown[]>;

const resolves =
  (rows: unknown[]): Execute =>
  () =>
    Promise.resolve(rows);

const rejects =
  (err: Error): Execute =>
  () =>
    Promise.reject(err);

function terminal(execute: Execute) {
  return { toSQL: () => ({ sql: "quota_usage query" }), execute };
}

function insertChain(execute: Execute) {
  const q = terminal(execute);
  return {
    insert: () => ({ values: () => ({ onConflictDoUpdate: () => ({ returning: () => q }) }) }),
  } as never;
}

function selectChain(execute: Execute) {
  const q = terminal(execute);
  return { select: () => ({ from: () => ({ where: () => q }) }) } as never;
}

function updateChain(execute: Execute) {
  const q = terminal(execute);
  return { update: () => ({ set: () => ({ where: () => q }) }) } as never;
}

function capturingInstrumentation() {
  const capture = mock(() => undefined);
  return { capture, instrumentation: Object.assign(new NoOpInstrumentation(), { capture }) };
}

describe("DrizzleQuotaUsageStore.increment", () => {
  it("returns the stored used value on success (Result.ok)", async () => {
    const store = new DrizzleQuotaUsageStore(new NoOpInstrumentation());

    const res = await store.increment(
      "org1",
      "uploads",
      3,
      period,
      insertChain(resolves([{ used: 7 }])),
    );

    expect(res.isSuccess).toBe(true);
    expect(res.getValue()).toBe(7);
  });

  it("captures + fails closed on a store error", async () => {
    const { capture, instrumentation } = capturingInstrumentation();
    const store = new DrizzleQuotaUsageStore(instrumentation);

    const res = await store.increment(
      "org1",
      "uploads",
      3,
      period,
      insertChain(rejects(new Error("db down"))),
    );

    expect(res.isFailure).toBe(true);
    expect(capture).toHaveBeenCalled();
  });
});

describe("DrizzleQuotaUsageStore.reset", () => {
  it("returns Result.ok on success", async () => {
    const store = new DrizzleQuotaUsageStore(new NoOpInstrumentation());

    const res = await store.reset("org1", "uploads", period, updateChain(resolves([])));

    expect(res.isSuccess).toBe(true);
  });

  it("captures + fails closed on a store error", async () => {
    const { capture, instrumentation } = capturingInstrumentation();
    const store = new DrizzleQuotaUsageStore(instrumentation);

    const res = await store.reset(
      "org1",
      "uploads",
      period,
      updateChain(rejects(new Error("db down"))),
    );

    expect(res.isFailure).toBe(true);
    expect(capture).toHaveBeenCalled();
  });
});

describe("DrizzleQuotaUsageStore.current", () => {
  it("returns 0 when no row exists (Result.ok)", async () => {
    const store = new DrizzleQuotaUsageStore(new NoOpInstrumentation());

    const res = await store.current("org1", "uploads", period, selectChain(resolves([])));

    expect(res.isSuccess).toBe(true);
    expect(res.getValue()).toBe(0);
  });

  it("captures + fails closed on a store error", async () => {
    const { capture, instrumentation } = capturingInstrumentation();
    const store = new DrizzleQuotaUsageStore(instrumentation);

    const res = await store.current(
      "org1",
      "uploads",
      period,
      selectChain(rejects(new Error("db down"))),
    );

    expect(res.isFailure).toBe(true);
    expect(capture).toHaveBeenCalled();
  });
});
