// Aligned with BetterAuth `session.cookieCache.maxAge` (apps/api/src/auth.ts).
// Keep both ends in lockstep — the cookie cache decides when the server
// re-checks the DB; the query staleTime decides when the client refetches.
export const AUTH_QUERY_STALE_TIME_MS = 5 * 60 * 1000;
