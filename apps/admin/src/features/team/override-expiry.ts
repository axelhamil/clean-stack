const FURTHEST_YEARS = 10;

export type OverrideExpiry = { kind: "none" } | { kind: "at"; iso: string } | { kind: "invalid" };

function dayOf(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${date.getFullYear()}-${month}-${day}`;
}

export function earliestExpiryDay(now: Date): string {
  return dayOf(now);
}

export function latestExpiryDay(now: Date): string {
  return `${now.getFullYear() + FURTHEST_YEARS}-12-31`;
}

export function overrideExpiryOf(day: string, now: Date = new Date()): OverrideExpiry {
  if (!day) return { kind: "none" };

  const isInRange = day >= earliestExpiryDay(now) && day <= latestExpiryDay(now);
  const end = new Date(`${day}T23:59:59.999`);
  if (!isInRange || Number.isNaN(end.getTime())) return { kind: "invalid" };

  return { kind: "at", iso: end.toISOString() };
}
