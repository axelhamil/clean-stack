import { type IUseCase, Result } from "@packages/ddd-kit";
import type { IQuotaCounter } from "../../ports/services/quota-counter.port";
import type { IQuotaLock } from "../../ports/services/quota-lock.port";
import { hasQuotaRemaining, quotaExceeded } from "../../services/quota-policy.service";
import type { ReserveQuotaError, ReserveQuotaInput } from "./reserve-quota.dto";

export class ReserveQuotaUseCase implements IUseCase<ReserveQuotaInput, void, ReserveQuotaError> {
  constructor(
    private readonly lock: IQuotaLock,
    private readonly counter: IQuotaCounter,
  ) {}

  async execute({
    organizationId,
    resource,
    limit,
  }: ReserveQuotaInput): Promise<Result<void, ReserveQuotaError>> {
    if (limit === null) return Result.ok();

    const locked = await this.lock.acquire(organizationId, resource);
    if (locked.isFailure) return Result.fail(locked.getError());

    const used = await this.counter.count(organizationId, resource);
    if (used.isFailure) return Result.fail(used.getError());

    if (!hasQuotaRemaining(used.getValue(), limit)) {
      return Result.fail(quotaExceeded(used.getValue(), limit));
    }

    return Result.ok();
  }
}
