import { OVERRIDE_MAX_YEARS } from "@packages/access-control";

export function isOverrideExpiryWithinBound(value: string): boolean {
  const end = new Date(value).getTime();
  const now = new Date();
  const latest = Date.UTC(now.getUTCFullYear() + OVERRIDE_MAX_YEARS + 1, 0, 2);

  return end > now.getTime() && end < latest;
}
