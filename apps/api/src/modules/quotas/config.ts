import type { QuotaPeriod } from "./application/ports/quota-usage.port";

const LIFETIME_END = new Date("9999-12-31T00:00:00Z");

export function currentPeriodFor(sub: {
  periodStart: Date | null;
  periodEnd: Date | null;
}): QuotaPeriod {
  if (sub.periodStart && sub.periodEnd) {
    return { start: sub.periodStart, end: sub.periodEnd };
  }
  return { start: new Date(0), end: LIFETIME_END };
}
