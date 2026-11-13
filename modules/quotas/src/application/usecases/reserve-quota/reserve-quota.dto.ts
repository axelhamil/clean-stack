import type { QuotaCountError } from "../../ports/services/quota-counter.port";
import type { QuotaLockError } from "../../ports/services/quota-lock.port";
import type { QuotaExceeded } from "../../services/quota-policy.service";

export interface ReserveQuotaInput {
  organizationId: string;
  resource: string;
  limit: number | null;
}

export type ReserveQuotaError = QuotaExceeded | QuotaLockError | QuotaCountError;
