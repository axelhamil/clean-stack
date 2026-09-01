import type { NotificationFrequency } from "@packages/events";

/**
 * The UTC hour a `daily` digest is cut at, when no deployment says otherwise.
 *
 * Wired from `NOTIFICATION_DIGEST_HOUR_UTC` in the container; a literal here so
 * the fan-out subscriber stays constructible in a test without a parsed `.env`.
 */
export const DEFAULT_DIGEST_HOUR_UTC = 8;

/**
 * When a notification becomes eligible for its digest e-mail.
 *
 * A non-immediate frequency does not suppress the e-mail, it postpones it: the
 * flush groups everything that came due into a single message per user and
 * category. This is the whole of that decision, and it is a pure function of
 * the instant the event occurred — never of "now", never of when the last
 * digest went out. That matters: a window anchored on the previous send drifts
 * a little further every cycle (a run that fires 40 s late pushes the next one
 * 40 s later still), and nothing about it is reproducible in a test. Anchoring
 * on wall-clock boundaries instead means two events an hour apart land in two
 * different buckets, always the same two, whichever process computes them.
 *
 * The boundary is strict: an event landing exactly on the anchor belongs to the
 * *next* window, because the digest for the one it sits on has already been cut.
 */
export function digestDueAt(
  occurredAt: Date,
  frequency: NotificationFrequency,
  anchorHourUtc: number = DEFAULT_DIGEST_HOUR_UTC,
): Date {
  if (frequency === "immediate") return occurredAt;

  const due = new Date(occurredAt.getTime());

  if (frequency === "hourly") {
    due.setUTCMinutes(0, 0, 0);
    due.setUTCHours(due.getUTCHours() + 1);
    return due;
  }

  due.setUTCHours(anchorHourUtc, 0, 0, 0);
  if (due.getTime() <= occurredAt.getTime()) due.setUTCDate(due.getUTCDate() + 1);
  return due;
}
