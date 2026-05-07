export const JITTER_BASE_MS = 1000;
export const JITTER_CAP_MS = 12 * 60 * 60 * 1000;
export const JITTER_MULTIPLIER = 3;
export const JITTER_MAX_ATTEMPTS = 5;

export function nextDelayMs(lastDelayMs: number): number {
  const upper = Math.max(JITTER_BASE_MS, lastDelayMs * JITTER_MULTIPLIER);
  const delay = JITTER_BASE_MS + Math.random() * (upper - JITTER_BASE_MS);
  return Math.min(JITTER_CAP_MS, Math.floor(delay));
}

export function isDeadLetter(attempt: number): boolean {
  return attempt >= JITTER_MAX_ATTEMPTS;
}

export function nextAttemptAt(
  currentAttempts: number,
  lastDelayMs: number,
): { date: Date | null; delayMs: number } {
  if (isDeadLetter(currentAttempts + 1)) return { date: null, delayMs: -1 };
  const delayMs = nextDelayMs(lastDelayMs);
  return { date: new Date(Date.now() + delayMs), delayMs };
}
