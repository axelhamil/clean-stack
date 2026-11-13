# Quota gating (B.2)

Dormant, complete skeleton extending B.1 billing. Quotas are **config-in-code** in
`modules/billing/src/application/services/entitlement-policy.service.ts` (`ENTITLEMENTS[tier].quotas`): a gate change is
a code change + deploy, never a Stripe dashboard toggle.

## Activate a quota on a resource

1. Add the key to `QuotaKey` and a limit per tier in `ENTITLEMENTS[*].quotas`.
2. **Counted table**: map the key to its table in `quotaTables` of
   `apps/api/src/composition/sources/quotas.ts`
   (`yourKey: { table: yourTable, organizationColumn: yourTable.organizationId }`). The host binds it
   because only the host may read another module's `schemas/`; the quotas module never imports one.
3. **Enforcement (authoritative)**: inside the resource write's `uow.run()`, call
   `ReserveQuotaUseCase.execute({ organizationId, resource: "yourKey", limit: view.quotas.yourKey })`
   **before** the insert and return its failure. The `IQuotaLock` advisory lock and the `IQuotaCounter` `COUNT(*)` both read the run's ambient transaction, so they are atomic against the write (no TOCTOU). The result fails with `BILLING_QUOTA_EXCEEDED` at the cap, and with `QUOTA_TRANSACTION_UNAVAILABLE` outside a `uow.run()`, since the lock would end with the statement.
4. **Pre-check (UX, optional)**: mount `requireQuota("yourKey", readUsage)` on the
   route to reject early with `429 BILLING_QUOTA_EXCEEDED` before doing the work.
5. **Front**: `const { useQuota } = useEntitlements(); useQuota("yourKey", currentUsage)` →
   `{ limit, used, remaining, exceeded }`; or `<QuotaGate quotaKey="yourKey" used={n} fallback={<Upgrade/>}>`.

## Two counting strategies

- **Live `COUNT(*)` (default)**: `IQuotaCounter` (`ScopedRowCounter` over the host's `quotaTables`). The source table is the truth, zero drift.
  Use for uploads/projects/seats (low-medium volume).
- **Denormalized `quota_usage` (high-volume)**: `IQuotaUsageStore.increment` inside the write TX,
  window aligned on the Stripe billing period (`currentPeriodFor(subscription)`). Use when
  `COUNT(*)` over the source is too expensive (e.g. `apiCallsPerMonth`). Bounded drift via
  period reset; add a nightly reconciliation (`used = COUNT(*)`) for belt-and-suspenders.

## Rejected alternatives (SOTA 2026)

- **Stripe Entitlements API**: boolean-only, no quantitative quotas, no runtime enforcement.
- **Stripe Billing Meters**: metering-to-bill (async), not gating-to-block (synchronous hard cap).
- **`@better-auth/stripe` native `limits`**: would create a 2nd SSOT; quotas stay in `ENTITLEMENTS`.
