import type { Option } from "@packages/ddd-kit";
import type { DeletionState } from "../value-objects/deletion-state.vo";

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

export type WipeEligibility = "wiped" | "due" | "not-due";

export function gracePeriodEnd(requestedAt: Date, gracePeriodDays: number): Date {
  return new Date(requestedAt.getTime() + gracePeriodDays * DAY_MS);
}

export function wipeEligibility(state: DeletionState, now: Date): WipeEligibility {
  if (state.isWiped()) return "wiped";

  const until = state.pendingUntil();
  if (until.isNone() || until.unwrap() > now) return "not-due";

  return "due";
}

export function isExportAllowed(
  lastExportRequestedAt: Option<Date>,
  now: Date,
  exportRateLimitHours: number,
): boolean {
  if (lastExportRequestedAt.isNone()) return true;

  return now.getTime() >= lastExportRequestedAt.unwrap().getTime() + exportRateLimitHours * HOUR_MS;
}
