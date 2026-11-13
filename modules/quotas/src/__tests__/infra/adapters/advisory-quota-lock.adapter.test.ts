import { describe, expect, it, mock } from "bun:test";
import { UnitOfWorkContext } from "@packages/ddd-kit";
import { mockInstrumentation } from "@packages/test/bun/instrumentation";
import { AdvisoryQuotaLock } from "../../../infra/adapters/advisory-quota-lock.adapter";

describe("AdvisoryQuotaLock", () => {
  it("given no open unit of work, when the lock is taken, then it refuses", async () => {
    const lock = new AdvisoryQuotaLock(mockInstrumentation());

    const result = await lock.acquire("org1", "uploads");

    expect(result.getError().code).toBe("QUOTA_TRANSACTION_UNAVAILABLE");
  });

  it("given an open unit of work, when the lock is taken, then it locks inside that transaction", async () => {
    const tx = { execute: mock(async () => undefined) };
    const lock = new AdvisoryQuotaLock(mockInstrumentation());

    const result = await UnitOfWorkContext.run(tx, () => lock.acquire("org1", "uploads"));

    expect(result.isSuccess).toBe(true);
    expect(tx.execute).toHaveBeenCalledTimes(1);
  });
});
