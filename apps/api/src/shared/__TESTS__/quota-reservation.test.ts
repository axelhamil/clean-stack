import { describe, expect, it, mock } from "bun:test";
import { AppErrorException, UnitOfWorkContext } from "@packages/ddd-kit";
import { countScopedRows, reserveQuota } from "../db/quota-reservation";

function fakeTx() {
  return { execute: mock(async () => undefined) };
}

function fakeCountTx(rows: { n: number }[]) {
  return {
    select: () => ({ from: () => ({ where: () => Promise.resolve(rows) }) }),
  };
}

describe("countScopedRows", () => {
  it("returns the count from the row", async () => {
    const result = await UnitOfWorkContext.run(fakeCountTx([{ n: 5 }]), () =>
      countScopedRows(null as never, null as never, "org1"),
    );
    expect(result).toBe(5);
  });

  it("returns 0 via the ?? guard when no rows are returned", async () => {
    const result = await UnitOfWorkContext.run(fakeCountTx([]), () =>
      countScopedRows(null as never, null as never, "org1"),
    );
    expect(result).toBe(0);
  });
});

describe("reserveQuota", () => {
  it("skips the lock and count when the limit is unlimited (null)", async () => {
    const tx = fakeTx();
    const countFn = mock(async () => 999);
    await UnitOfWorkContext.run(tx, () => reserveQuota("org1", "uploads", null, countFn));
    expect(countFn).not.toHaveBeenCalled();
    expect(tx.execute.mock.calls.length).toBe(0);
  });

  it("takes the advisory lock then counts, passing under the cap", async () => {
    const tx = fakeTx();
    const countFn = mock(async () => 4);
    await UnitOfWorkContext.run(tx, () => reserveQuota("org1", "uploads", 10, countFn));
    expect(tx.execute.mock.calls.length).toBe(1);
    expect(countFn).toHaveBeenCalledTimes(1);
  });

  it("throws BILLING_QUOTA_EXCEEDED at the cap", async () => {
    const countFn = mock(async () => 10);
    await expect(
      UnitOfWorkContext.run(fakeTx(), () => reserveQuota("org1", "uploads", 10, countFn)),
    ).rejects.toBeInstanceOf(AppErrorException);
  });

  it("given no open unit of work, when a capped quota is reserved, then it refuses before counting", async () => {
    const countFn = mock(async () => 0);
    await expect(reserveQuota("org1", "uploads", 10, countFn)).rejects.toThrow("uow.run");
    expect(countFn).not.toHaveBeenCalled();
  });
});
