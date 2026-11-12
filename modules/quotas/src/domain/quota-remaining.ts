import { AppErrorException } from "@packages/ddd-kit";

export function hasQuotaRemaining(used: number, limit: number | null): boolean {
  return limit === null || used < limit;
}

export function quotaExceededError(
  used: number,
  limit: number | null,
  key?: string,
): AppErrorException {
  const subject = key === undefined ? "Quota exceeded" : `Quota exceeded for ${key}`;
  return new AppErrorException({
    code: "BILLING_QUOTA_EXCEEDED",
    message: `${subject} (${used}/${limit}).`,
  });
}
