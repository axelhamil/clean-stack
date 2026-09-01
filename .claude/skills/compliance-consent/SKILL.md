---
name: compliance-consent
description: Use when working on policy versioning, terms acceptance, cookie consent or their sweeps. Trigger on "policy", "CGU", "terms", "consent", "cookie banner", "cc_sid", "RGPD", "acceptance", "requireCurrentPolicies". Not for audit-log or generic security work.
---

# Compliance infra (policies + cookie consent)

Both are **compliance infra, not DDD**. They mirror each other's shape.

## Policy versioning (`modules/policies/`)

Records which policy version each user accepted and when.

- **`@packages/policies`** is the SSOT (`POLICY_VERSIONS`, `POLICY_TYPES`, `POLICY_CHANGELOG`, `POLICY_URLS`). Bump the version string → every consumer sees the change at compile time. `POLICY_URLS` is the swap point for hosting policy text externally.
- **`PolicyAcceptanceService.accept(userId, types, ipAddress?)`** writes N rows + emits N `user.policy.accepted` events in one `uow.run` TX — any failure throws (no partial acceptance). `getStaleTypes(userId)` drives the gate. `DrizzlePolicyAcceptanceStore` is fully §8-instrumented.
- **`requireCurrentPolicies`** (`shared/middleware/policy.middleware.ts`) — composable, **not mounted globally** — 409 when any policy is stale. `_shell` `beforeLoad` redirect is the UX gate; this middleware is defense-in-depth.
- **Sign-up acceptance via `/verify-email` hook** — called from BetterAuth `/verify-email` after-hook AND from `POST /me/policies/accept`. Not at `/sign-up/email` (no session yet; returns synthetic user on duplicate-email).

## Cookie consent (`modules/consents/`)

Records device-scoped consent (guest→user reconciled at login).

- **`@packages/cookie-consent`** is the SSOT (`CONSENT_CATEGORIES`, `OPTIONAL_CATEGORIES`, `CONSENT_COOKIE_NAME = "cc_sid"`, `COOKIE_CONSENT_VERSION`, grant/refusal TTL). Bump `COOKIE_CONSENT_VERSION` → all users re-prompted.
- **`ConsentService`**: `record` (append-only, latest wins) · `withdraw` · `getActive` (with subjectId fallback for logged-in users with no record) · `reconcile(subjectId, userId)` (UPDATE `user_id IS NULL` rows). `DrizzleConsentStore` is §8-instrumented.
- **Routes `/consents` — public, `optionalAuth`**. **Rate-limit `CONSENT_POST_POLICY` on POST/DELETE only — GET is exempt**: GET is called on every render prefetch; rate-limiting it saturates the window on normal reloads and blocks the consent banner.
- Cookie `cc_sid`: `httpOnly`, `secure: isProd`, `sameSite: isProd ? "none" : "lax"`, `path: "/"`. **No `__Host-` prefix** — cross-origin deploy requires `sameSite: "none"`, incompatible with `__Host-` (same constraint as the BetterAuth session cookie).
- **Sweep** (`sweep-consents.route.ts`, HMAC-gated): purges `user_id IS NULL AND expires_at < cutoff` (env `CONSENT_RETENTION_DAYS=365`).

Reconciliation at login uses the `hooks.after` + `ctx.context.newSession` pattern — see skill `auth-server`.
