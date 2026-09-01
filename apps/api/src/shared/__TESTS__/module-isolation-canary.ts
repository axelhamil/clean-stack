/**
 * A module owned by nothing but the two `module-isolation.*.test.ts` files.
 *
 * One of them replaces it, the other asserts it is still the real one. Nothing
 * else imports it, so when the harness stops isolating test files the failure is
 * this pair and only this pair — a named canary rather than a cascade of
 * "Export not found" errors in whichever unrelated suite happened to run next.
 */
export const isolationCanary = "real";
