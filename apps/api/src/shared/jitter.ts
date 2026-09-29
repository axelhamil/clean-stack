import { Option } from "@packages/ddd-kit";

/**
 * Decorrelated jitter retry math, after the AWS "Exponential Backoff and Jitter" pattern.
 *
 * Each delay is sampled uniformly in `[BASE, max(BASE, lastDelay × MULTIPLIER)]`
 * rather than `[0, cap]`, which avoids the thundering-herd that pure random
 * backoff produces when many workers retry simultaneously. Cap prevents unbounded
 * growth. Used by `OutboxDispatcher` and the webhook delivery worker.
 */
export const JITTER_BASE_MS = 1000;
export const JITTER_CAP_MS = 12 * 60 * 60 * 1000;
export const JITTER_MULTIPLIER = 3;
export const JITTER_MAX_ATTEMPTS = 5;

export function nextDelayMs(lastDelayMs: number): number {
  const upper = Math.max(JITTER_BASE_MS, lastDelayMs * JITTER_MULTIPLIER);
  const delay = JITTER_BASE_MS + Math.random() * (upper - JITTER_BASE_MS);
  return Math.min(JITTER_CAP_MS, Math.floor(delay));
}

/**
 * The delay the previous retry would have waited after `currentAttempts` failures,
 * fed back into `nextDelayMs` as its `lastDelayMs`. Workers only persist the attempt
 * count, never the delay they actually slept, so the growth curve is rebuilt from it.
 */
export function expectedDelayFromAttempts(currentAttempts: number): number {
  return JITTER_BASE_MS * JITTER_MULTIPLIER ** Math.max(0, currentAttempts);
}

/** Returns true when the event has exhausted all retry attempts and should be parked. */
export function isDeadLetter(attempt: number): boolean {
  return attempt >= JITTER_MAX_ATTEMPTS;
}

/**
 * The absolute instant of the next retry, or none when the next attempt would
 * exceed the dead-letter threshold. Callers store it in `next_attempt_at`.
 */
export function nextAttemptAt(currentAttempts: number, lastDelayMs: number): Option<Date> {
  if (isDeadLetter(currentAttempts + 1)) return Option.none();

  return Option.some(new Date(Date.now() + nextDelayMs(lastDelayMs)));
}
