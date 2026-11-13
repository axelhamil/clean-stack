import { type IInstrumentation, Result } from "@packages/ddd-kit";
import { ambientTransaction, lockForTransaction } from "@packages/drizzle";
import type { IQuotaLock, QuotaLockError } from "../../application/ports/services/quota-lock.port";

export class AdvisoryQuotaLock implements IQuotaLock {
  constructor(private readonly instrumentation: IInstrumentation) {}

  async acquire(organizationId: string, resource: string): Promise<Result<void, QuotaLockError>> {
    if (ambientTransaction().isNone()) {
      return Result.fail({
        code: "QUOTA_TRANSACTION_UNAVAILABLE",
        message: "A quota is reserved inside uow.run: its lock lives as long as the transaction.",
      });
    }

    return this.instrumentation.startSpan({ name: "AdvisoryQuotaLock > acquire" }, async () => {
      try {
        await lockForTransaction(`${organizationId}:${resource}`);

        return Result.ok();
      } catch (err) {
        this.instrumentation.capture(err);
        return Result.fail({
          code: "QUOTA_PROVIDER_FAILURE",
          message: "The quota lock could not be taken.",
        });
      }
    });
  }
}
