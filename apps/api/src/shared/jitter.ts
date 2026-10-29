/**
 * Decorrelated jitter retry math, after the AWS "Exponential Backoff and Jitter" pattern.
 *
 * Each delay is sampled uniformly in `[BASE, max(BASE, lastDelay × MULTIPLIER)]`
 * rather than `[0, cap]`, which avoids the thundering-herd that pure random
 * backoff produces when many workers retry simultaneously. Cap prevents unbounded
 * growth. Every queue (outbox relay, email and webhook delivery workers) turns it into
 * `retryAfterSeconds` through `failureSchedule` and stores `now() + interval` on the
 * database clock, never a process-clock instant.
 */
export const JITTER_BASE_MS = 1000;
export const JITTER_CAP_MS = 12 * 60 * 60 * 1000;
export const JITTER_MULTIPLIER = 3;

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

export function retryAfterSeconds(attempts: number): number {
  return Math.ceil(nextDelayMs(expectedDelayFromAttempts(attempts)) / 1000);
}

export interface FailurePolicy {
  wasDead: boolean;
  maxAttempts: number;
  deadRetrySeconds: number;
}

export interface FailureSchedule {
  dead: boolean;
  retryAfterSeconds: number;
}

export function failureSchedule(attempts: number, policy: FailurePolicy): FailureSchedule {
  const dead = policy.wasDead || attempts >= policy.maxAttempts;

  return {
    dead,
    retryAfterSeconds: dead ? policy.deadRetrySeconds : retryAfterSeconds(attempts),
  };
}
