---
name: billing-entitlements
description: Use when working on billing, plans, tiers, seats, feature flags or quota gating. Trigger on "billing", "Stripe", "entitlement", "tier", "requireFeature", "requirePlan", "requireQuota", "reserveQuota", "seats", "subscription". Not for org roles/permissions in general.
---

# Billing (`modules/billing/` + `stripe()` plugin)

Pragmatic infra, **NOT DDD**. `config.ts` holds `ENTITLEMENTS[tier]` (features/rank/maxMembers, `null` = unlimited). `@better-auth/stripe` plugin owns subscription state (its `subscription` table, webhook-synced). Stripe owns price/display (`metadata.tier` join key). Typed config is the single business-rules SSOT — never duplicate into a domain model.

## Four gate axes (independent, never conflated)

1. **Role** — `billing:["read","manage"]` capability (`@packages/access-control`).
2. **Seats** — hard-capped in `beforeAddMember` + `beforeAcceptInvitation` + `beforeCreateInvitation`. **All three must be wired** — missing one silently admits overquota members.
3. **Tier/feature** — `requireFeature(flag)` / `requirePlan(minTier)` → 402 `BILLING_PAYMENT_REQUIRED`.
4. **Quota** (Phase B.2, dormant) — limits in `ENTITLEMENTS[tier].quotas` (`null` = unlimited). `requireQuota(key, readUsage)` = best-effort pre-check → 429 `BILLING_QUOTA_EXCEEDED`; `reserveQuota(tx, orgId, key, limit, countFn)` = **authoritative** gate (TOCTOU-safe: `pg_advisory_xact_lock` + count inside `uow.run()`). Counting: live `countScopedRows` (default) or `IQuotaUsageStore.{increment,current,reset}` (high-volume — increment in same TX as gated write, never background). Details: [`docs/QUOTA-GATING.md`](../../docs/QUOTA-GATING.md).

No billing backoffice — Stripe Checkout + Billing Portal hosted. `POST /billing/portal` gated `requireOrgPermission({ billing:["manage"] })`.

## Events

`billing.subscription.{created,updated,cancelled}`, `billing.payment.failed` — from stripe plugin callbacks in `auth.ts` (same BetterAuth bridge pattern, see skill `events-outbox`). `billing.quota.exceeded` emitted by `requireQuota` only — `reserveQuota` callers emit it themselves.
