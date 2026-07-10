import { describe, expect, it, mock } from "bun:test";
import { AppErrorException } from "@packages/ddd-kit";
import { reserveQuota } from "../db/quota-reservation";
import type { ITransaction } from "../transaction";

function fakeTx() {
  return { execute: mock(async () => undefined) } as unknown as ITransaction;
}

describe("reserveQuota", () => {
  it("skips the lock and count when the limit is unlimited (null)", async () => {
    const tx = fakeTx();
    const countFn = mock(async () => 999);
    await reserveQuota(tx, "org1", "uploads", null, countFn);
    expect(countFn).not.toHaveBeenCalled();
    expect((tx.execute as ReturnType<typeof mock>).mock.calls.length).toBe(0);
  });

  it("takes the advisory lock then counts, passing under the cap", async () => {
    const tx = fakeTx();
    const countFn = mock(async () => 4);
    await reserveQuota(tx, "org1", "uploads", 10, countFn);
    expect((tx.execute as ReturnType<typeof mock>).mock.calls.length).toBe(1); // lock taken
    expect(countFn).toHaveBeenCalledTimes(1);
  });

  it("throws BILLING_QUOTA_EXCEEDED at the cap", async () => {
    const tx = fakeTx();
    const countFn = mock(async () => 10);
    await expect(reserveQuota(tx, "org1", "uploads", 10, countFn)).rejects.toBeInstanceOf(
      AppErrorException,
    );
  });
});
