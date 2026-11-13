import { describe, expect, it } from "bun:test";
import { UnitOfWorkContext } from "@packages/ddd-kit";
import { mockInstrumentation } from "@packages/test/bun/instrumentation";
import { DrizzleQuotaUsageRepository } from "../../../infra/repos/drizzle/quota-usage.repository";

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
  const instrumentation = mockInstrumentation();
  return { capture: instrumentation.capture, instrumentation };
}

describe("DrizzleQuotaUsageRepository.increment", () => {
  it("returns the stored used value on success (Result.ok)", async () => {
    const store = new DrizzleQuotaUsageRepository(mockInstrumentation());

    const res = await UnitOfWorkContext.run(insertChain(resolves([{ used: 7 }])), () =>
      store.increment("org1", "uploads", 3, period),
    );

    expect(res.isSuccess).toBe(true);
    expect(res.getValue()).toBe(7);
  });

  it("captures + fails closed on a store error", async () => {
    const { capture, instrumentation } = capturingInstrumentation();
    const store = new DrizzleQuotaUsageRepository(instrumentation);

    const res = await UnitOfWorkContext.run(insertChain(rejects(new Error("db down"))), () =>
      store.increment("org1", "uploads", 3, period),
    );

    expect(res.isFailure).toBe(true);
    expect(capture).toHaveBeenCalled();
  });
});

describe("DrizzleQuotaUsageRepository.reset", () => {
  it("returns Result.ok on success", async () => {
    const store = new DrizzleQuotaUsageRepository(mockInstrumentation());

    const res = await UnitOfWorkContext.run(updateChain(resolves([])), () =>
      store.reset("org1", "uploads", period),
    );

    expect(res.isSuccess).toBe(true);
  });

  it("captures + fails closed on a store error", async () => {
    const { capture, instrumentation } = capturingInstrumentation();
    const store = new DrizzleQuotaUsageRepository(instrumentation);

    const res = await UnitOfWorkContext.run(updateChain(rejects(new Error("db down"))), () =>
      store.reset("org1", "uploads", period),
    );

    expect(res.isFailure).toBe(true);
    expect(capture).toHaveBeenCalled();
  });
});

describe("DrizzleQuotaUsageRepository.current", () => {
  it("returns 0 when no row exists (Result.ok)", async () => {
    const store = new DrizzleQuotaUsageRepository(mockInstrumentation());

    const res = await UnitOfWorkContext.run(selectChain(resolves([])), () =>
      store.current("org1", "uploads", period),
    );

    expect(res.isSuccess).toBe(true);
    expect(res.getValue()).toBe(0);
  });

  it("captures + fails closed on a store error", async () => {
    const { capture, instrumentation } = capturingInstrumentation();
    const store = new DrizzleQuotaUsageRepository(instrumentation);

    const res = await UnitOfWorkContext.run(selectChain(rejects(new Error("db down"))), () =>
      store.current("org1", "uploads", period),
    );

    expect(res.isFailure).toBe(true);
    expect(capture).toHaveBeenCalled();
  });
});
