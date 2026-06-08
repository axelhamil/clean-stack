/**
 * Decorrelated jitter retry math — AWS "Exponential Backoff and Jitter" pattern.
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

/** Returns true when the event has exhausted all retry attempts and should be parked. */
export function isDeadLetter(attempt: number): boolean {
  return attempt >= JITTER_MAX_ATTEMPTS;
}

/**
 * Returns the absolute `Date` for the next retry and the computed delay, or
 * `{ date: null, delayMs: -1 }` when the next attempt would exceed the dead-letter
 * threshold. Callers store `date` directly in `next_attempt_at`.
 */
export function nextAttemptAt(
  currentAttempts: number,
  lastDelayMs: number,
): { date: Date | null; delayMs: number } {
  if (isDeadLetter(currentAttempts + 1)) return { date: null, delayMs: -1 };
  const delayMs = nextDelayMs(lastDelayMs);
  return { date: new Date(Date.now() + delayMs), delayMs };
}
