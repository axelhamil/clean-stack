# Quota gating (B.2)

Dormant, complete skeleton extending B.1 billing. Quotas are **config-in-code** in
`apps/api/src/modules/billing/config.ts` (`ENTITLEMENTS[tier].quotas`) — a gate change is
a code change + deploy, never a Stripe dashboard toggle.

## Activate a quota on a resource

1. Add the key to `QuotaKey` and a limit per tier in `ENTITLEMENTS[*].quotas`.
2. **Enforcement (authoritative)** — inside the resource write's `uow.run()`, call
   `reserveQuota(tx, orgId, "yourKey", view.quotas.yourKey, (tx) => countScopedRows(tx, yourTable, yourTable.organizationId, orgId))`
   **before** the insert. The advisory lock + `COUNT(*)` is atomic against the write (no TOCTOU).
3. **Pre-check (UX, optional)** — mount `requireQuota("yourKey", c => countScopedRows(...))` on the
   route to reject early with `429 BILLING_QUOTA_EXCEEDED` before doing the work.
4. **Front** — `const { useQuota } = useEntitlements(); useQuota("yourKey", currentUsage)` →
   `{ limit, used, remaining, exceeded }`; or `<QuotaGate quotaKey="yourKey" used={n} fallback={<Upgrade/>}>`.

## Two counting strategies

- **Live `COUNT(*)` (default)** — `countScopedRows`. The source table is the truth, zero drift.
  Use for uploads/projects/seats (low-medium volume).
- **Denormalized `quota_usage` (high-volume)** — `IQuotaUsageStore.increment` inside the write TX,
  window aligned on the Stripe billing period (`currentPeriodFor(subscription)`). Use when
  `COUNT(*)` over the source is too expensive (e.g. `apiCallsPerMonth`). Bounded drift via
  period reset; add a nightly reconciliation (`used = COUNT(*)`) for belt-and-suspenders.

## Rejected alternatives (SOTA 2026)

- **Stripe Entitlements API** — boolean-only, no quantitative quotas, no runtime enforcement.
- **Stripe Billing Meters** — metering-to-bill (async), not gating-to-block (synchronous hard cap).
- **`@better-auth/stripe` native `limits`** — would create a 2nd SSOT; quotas stay in `ENTITLEMENTS`.
