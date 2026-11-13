import { describe, expect, it } from "bun:test";
import { Result } from "@packages/ddd-kit";
import { mockPort } from "@packages/test/bun";
import type {
  IQuotaCounter,
  QuotaCountError,
} from "../../../application/ports/services/quota-counter.port";
import type {
  IQuotaLock,
  QuotaLockError,
} from "../../../application/ports/services/quota-lock.port";
import { ReserveQuotaUseCase } from "../../../application/usecases/reserve-quota/reserve-quota.usecase";

interface Given {
  locked?: Result<void, QuotaLockError>;
  used?: Result<number, QuotaCountError>;
}

function setup({ locked = Result.ok(), used = Result.ok(0) }: Given = {}) {
  const lock = mockPort<IQuotaLock>();
  lock.acquire.mockResolvedValue(locked);

  const counter = mockPort<IQuotaCounter>();
  counter.count.mockResolvedValue(used);

  return { lock, counter, useCase: new ReserveQuotaUseCase(lock, counter) };
}

const input = { organizationId: "org1", resource: "uploads" };

describe("ReserveQuotaUseCase", () => {
  it("given an unlimited quota, when it is reserved, then it passes without locking or counting", async () => {
    const { lock, counter, useCase } = setup({ used: Result.ok(999) });

    const result = await useCase.execute({ ...input, limit: null });

    expect(result.isSuccess).toBe(true);
    expect(lock.acquire).not.toHaveBeenCalled();
    expect(counter.count).not.toHaveBeenCalled();
  });

  it("given usage under the cap, when it is reserved, then it locks the quota and passes", async () => {
    const { lock, useCase } = setup({ used: Result.ok(4) });

    const result = await useCase.execute({ ...input, limit: 10 });

    expect(result.isSuccess).toBe(true);
    expect(lock.acquire).toHaveBeenCalledWith("org1", "uploads");
  });

  it("given usage at the cap, when it is reserved, then it fails with the quota exceeded code", async () => {
    const { useCase } = setup({ used: Result.ok(10) });

    const result = await useCase.execute({ ...input, limit: 10 });

    expect(result.getError()).toEqual({
      code: "BILLING_QUOTA_EXCEEDED",
      message: "Quota exceeded (10/10).",
    });
  });

  it("given the lock cannot be taken, when it is reserved, then it refuses before counting", async () => {
    const { counter, useCase } = setup({
      locked: Result.fail({ code: "QUOTA_TRANSACTION_UNAVAILABLE", message: "uow.run" }),
    });

    const result = await useCase.execute({ ...input, limit: 10 });

    expect(result.getError().code).toBe("QUOTA_TRANSACTION_UNAVAILABLE");
    expect(counter.count).not.toHaveBeenCalled();
  });
});
