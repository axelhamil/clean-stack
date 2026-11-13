import { type AppError, AppErrorException } from "@packages/ddd-kit";
import type { QuotaPeriod } from "../ports/repositories/quota-usage.port";

export type QuotaExceeded = AppError<"BILLING_QUOTA_EXCEEDED">;

const LIFETIME_END = new Date("9999-12-31T00:00:00Z");

export function hasQuotaRemaining(used: number, limit: number | null): boolean {
  return limit === null || used < limit;
}

export function quotaExceeded(used: number, limit: number | null, key?: string): QuotaExceeded {
  const subject = key === undefined ? "Quota exceeded" : `Quota exceeded for ${key}`;

  return { code: "BILLING_QUOTA_EXCEEDED", message: `${subject} (${used}/${limit}).` };
}

export function quotaExceededError(
  used: number,
  limit: number | null,
  key?: string,
): AppErrorException {
  return new AppErrorException(quotaExceeded(used, limit, key));
}

export function currentPeriodFor(sub: {
  periodStart: Date | null;
  periodEnd: Date | null;
}): QuotaPeriod {
  if (sub.periodStart && sub.periodEnd) {
    return { start: sub.periodStart, end: sub.periodEnd };
  }
  return { start: new Date(0), end: LIFETIME_END };
}
