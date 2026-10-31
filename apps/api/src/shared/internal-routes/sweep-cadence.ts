import type { SweepRun } from "../ports/sweep-run.port";

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;

const DAILY_LATE_AFTER_MS = 26 * HOUR_MS;

const LATE_AFTER_MS: Readonly<Record<string, number>> = {
  "flush-notification-emails": 15 * MINUTE_MS,
};

export function isSweepLate(run: Pick<SweepRun, "label" | "finishedAt">, now: Date): boolean {
  const lateAfter = LATE_AFTER_MS[run.label] ?? DAILY_LATE_AFTER_MS;

  return now.getTime() - run.finishedAt.getTime() > lateAfter;
}
