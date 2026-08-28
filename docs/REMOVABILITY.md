# Removability runbook

The boilerplate ships modules you may not need. Removing one should be **measurable, mechanical, and TS-error-driven** — not a multi-day refactor. This document captures the contract and the worked example from the Phase 0.5 dry-run on `modules/rgpd` (May 2026).

> Audience: cloner who decides "I don't want feature X". Test: by the end of this page they should know exactly what to delete, what TS will surface, and roughly how long it takes.

---

## The contract (4 promises)

1. **Touch surface is bounded.** A removable module owns its files and is reached through a small set of public touch-points: 1 `.addModule()` line in `container.ts`, ≤ 2 `app.route()` lines in `index.ts`, ≤ 1 schema barrel re-export, ≤ N events in `@packages/events`, ≤ N templates in `email.port.ts`. **No module reads another module's internals.**
2. **TS error-points the rest.** After `trash apps/api/src/modules/<x>/`, `pnpm type-check` should report every remaining touch-point as a real type error — no orphan code, no silent dead exports (knip catches the rest).
3. **One-shot reversible.** Until the migration is run, the removal can be undone with `git checkout -- .`. After the migration, undoing requires re-running the previous migration.
4. **Shared kernel stays sane.** A `shared/ports/` port loses 1-of-2 consumers → demote back to the surviving module's `application/ports/`. A `shared/services/` impl with 0 consumers → delete. Shared kernel always has ≥ 2 consumers OR is cross-cutting infra by nature (rule documented in `apps/api/src/shared/CLAUDE.md`).

---

## 6-axis checklist (generic — applies to any module)

When removing module `<x>`, walk these 6 axes in order. The order minimises intermediate type-check breakage.

| # | Axis | Files to touch |
|---|---|---|
| 1 | **Module code (back)** | `trash apps/api/src/modules/<x>/`, remove from `container.ts` (`.addModule`), remove from `index.ts` (`app.route(...)` lines) |
| 2 | **Events catalog** | `packages/events/src/event-types.ts`, `payloads.ts`, `retention-map.ts` — drop event-types owned by `<x>` only (events emitted by other modules / BetterAuth bridge stay) |
| 3 | **Shared ports the module owned** | `shared/ports/<port>.ts` types added for `<x>` only (e.g. template keys in `email.port.ts`), `shared/services/<impl>.ts` matching entries |
| 4 | **Env vars** | `shared/env.ts` Zod schema, `.env.example` — every `<X>_*` env knob the module read |
| 5 | **Schema + auth.ts + migration** | `packages/drizzle/src/schema/*.ts` — table owned by `<x>` *or* columns the module added to a shared table; `apps/api/src/auth.ts` `additionalFields` if BetterAuth-owned table touched; run `pnpm db:generate` and **inspect** the migration before committing |
| 6 | **Front feature + composition + API client + router + docs** | `apps/app/src/features/<x>/`, plus host page composition (`<X>Card` removals), plus `shared/api/{queries,mutations}/<x>-*`, plus its `route(...)`/`index(...)` entry in `apps/app/routes.ts`, plus any `docs/*.md` sections that document the now-removed surface |

**Decision rules baked in**:
- **Decisor "schema-on-external-table"**: when the module added columns to a BetterAuth-owned table (e.g. RGPD adding `pending_deletion_until` on `user`), those columns are deletable, but the migration must come *after* the data is exported / not needed. Never drop a column with live business data without a backfill / export plan documented per project.
- **Decisor "shared port demotion"**: if a port in `shared/ports/` becomes single-consumer after the removal, move it back to that consumer's `application/ports/`. Don't keep an "almost shared" port in shared — it leaks future cross-module coupling.
- **Decisor "knip-driven cleanup"**: run `pnpm check:unused` (knip) after `pnpm type-check` is green. Knip surfaces transitively-dead exports (a helper used only by deleted files) that TS can't catch.

---

## Validation gates (run in this order)

After each axis, the worst gate that can fail is named in parens. After axis 6, the full suite must be green except for pre-existing failures unrelated to `<x>`.

1. `pnpm type-check` (TS — fastest, error-points missing touch-points)
2. `pnpm ci:check` (Biome — formatting / unused imports surfaced via TS but also linter-only rules)
3. `pnpm check:unused` (knip — transitive dead exports)
4. `pnpm check:duplication` (jscpd — sanity, rarely affected by deletion)
5. `pnpm build` (full monorepo bundle — catches dynamic `import()` chains that TS missed)
6. `pnpm test` (api + packages + app)

`pnpm dev` boot + `curl /livez` is the runtime gate but optional in a dry-run — the build gate covers it statically.

---

## Worked example — removing `modules/rgpd` (Phase 0.5 dry-run, May 2026)

The RGPD module was used as the first leaf to validate the contract end-to-end. The module was removed inside a throwaway git worktree, the gates were run, and the worktree was discarded — the boilerplate still ships RGPD. This section is the runbook the dry-run produced.

### Surface (cartography)

| Axis | Touch-points |
|---|---|
| 1. Back code | `apps/api/src/modules/rgpd/` (10 files: application/dto, application/ports, application/services, infrastructure/repositories, routes, internal.routes, module, tests). `container.ts:6,72`. `index.ts:12-13,55,62`. |
| 2. Events | 5 events in `packages/events`: `USER_DELETION_{REQUESTED,CANCELLED}`, `USER_DELETED`, `USER_EXPORT_{REQUESTED,COMPLETED}`. 5 payloads, 5 `RETENTION_MAP` entries. |
| 3. Ports | `apps/api/src/shared/ports/email.port.ts`: 3 template keys (`data_export_ready`, `delete_requested`, `delete_cancelled`, `delete_completed` — 4 keys, one is unused even without rgpd, kept for parity). `shared/services/email.service.ts`: matching `TEMPLATE_IDS`. |
| 4. Env vars | `RGPD_GRACE_PERIOD_DAYS`, `RGPD_EXPORT_RATE_LIMIT_HOURS`, `RGPD_SWEEP_BATCH_SIZE` in `shared/env.ts` + `.env.example`. |
| 5. Schema | `packages/drizzle/src/schema/auth.ts`: **3 columns** on `user` (`pendingDeletionUntil`, `deletedAt`, `lastExportRequestedAt`) — note: 3, not 2, because `deletedAt` lives only in the schema not in auth.ts `additionalFields`. `apps/api/src/auth.ts:107-113`: 3 `additionalFields` entries. Migration emitted by `pnpm db:generate`: 3 `ALTER TABLE user DROP COLUMN`. |
| 6. Front | `features/rgpd/` (9 files), `features/legal/data-rights.route.tsx`, `apps/app/routes.ts` (1 `route("/legal/data-rights", ...)` entry), `features/privacy/privacy.route.tsx` (`DataExportCard` import + usage — relocated to Privacy page in A.5; `features/danger/` no longer exists), `features/account/account.route.tsx` (`RgpdDeletionCard` import + usage + `<Link to="/legal/data-rights">` — contextual danger zone, relocated in A.5), `shared/api/queries/account-deletion.ts`, `shared/api/mutations/{cancel,request}-account-deletion.ts`, `shared/api/mutations/request-data-export.ts`. Docs: `CRON.md` (rgpd-sweep section), `INTEGRATIONS.md` (rgpd env section + template rows), `MODULES.md` (rgpd row), `EVENTS.md` (via-rgpd-service section + event count, currently 54 → 49 after removing the 5 RGPD events — verify the live count in `event-types.ts` at removal time). |

### Metrics measured

| Mesure | Valeur |
|---|---|
| Total files touched | **46** |
| Files deleted | **18** (11 back + 5 front feature + 2 legal route + 4 shared/api client) |
| Files modified | **28** (16 code + 10 docs + 2 schema/migration) |
| LOC net removed | **-2980** (3028 deletions / 48 insertions) |
| Migration emitted | `0004_xxx.sql` — 3 `DROP COLUMN` on `user` |
| `pnpm type-check` | ✅ 9/9 tasks, ~6s |
| `pnpm ci:check` (biome) | ✅ 357 files |
| `pnpm check:unused` (knip) | 🟡 1 hint — `throwApiError` orphan (transitively dead helper) |
| `pnpm check:duplication` (jscpd) | ✅ 0.07% |
| `pnpm build` | ✅ 10/10 tasks, ~1s |
| `pnpm test` | baseline 44 fails (pre-existing test infra issues unrelated to rgpd) → post-removal 33 fails (the 11 rgpd-specific tests are gone, no new fails) |

Total clock time end-to-end (including the cartography pass, axis-by-axis edits, all 6 gates, doc cleanup): roughly **45 min** for a developer who already knows the repo. Estimate **2-3 h** for a cloner doing this for the first time.

### Surprises the dry-run surfaced

1. **`deletedAt` column missed by the initial cartography** — added by RGPD service for "tombstone" logic, never exposed in BetterAuth `additionalFields`. The schema-only column was invisible to grep on `auth.ts`. *Generalisation*: read both the schema file AND `auth.ts` `additionalFields` when auditing a module that touches a BetterAuth-owned table; columns can be schema-only.
2. **`throwApiError` transitively dead** — `shared/api/errors/api-error.ts` exported a single helper used *only* by the 4 RGPD mutations. After removal, knip flagged it as unused. TS didn't catch it (legit export, no consumer). *Generalisation*: a shared/api helper with a single feature consumer is one-rename-away from being a feature-private helper; promote-or-demote on knip's signal.
3. **knip pattern `internal.routes.ts` had no match post-removal** — rgpd was the only module with an `internal.routes.ts`. The pattern in `knip.json` stayed but warned. *Generalisation*: knip patterns matching a single module become "no matches" hints when that module leaves; either remove the pattern or accept the hint until another module reuses it.
4. **Test suite already had 44 pre-existing failures** — the dry-run was not the cause. *Generalisation*: capture baseline test counts BEFORE the dry-run so you can distinguish "removal broke X tests" from "X tests were already broken". This is what made it possible to conclude "no regression".

### What you do NOT touch (worth naming)

- `apps/api/src/shared/event-emitter.ts` — `emitEvent()` is shared infrastructure used by uploads + BetterAuth bridge too. Stays.
- `apps/api/src/shared/services/audit-event-subscriber.ts` — the audit primitive (outbox event → `audit_log` row) is not RGPD-specific. Stays.
- `docs/HISTORY.md` mentions of RGPD — historical record, preserve.
- `docs/OBSERVABILITY.md` "RGPD-clean by default" — generic GDPR-compliance phrasing, not module-specific. Stays.
- Sentry `beforeSend` scrubbing — generic privacy hygiene, not RGPD-module-owned. Stays.

---

## When removability is *not* easy (named edge cases)

- **Module owned a shared port** that another module now depends on → demote the port back to the surviving module's `application/ports/` (otherwise `shared/ports/` keeps a single-consumer port forever).
- **Module's events are still emitted by something else** (cross-bridge: BetterAuth, Stripe, webhooks) → the event-type stays in the catalog. Audit which subscribers might still write rows; if none, drop the retention entry only.
- **Module owns a DB table referenced by other modules' rows** (FK) → can't drop the table without cascade or backfill. Document a migration step that resolves the FK before the drop.
- **Module owns a `<X>Card` composed into a Settings hub** that other modules also compose → the hub stays, only the card slot leaves. Don't refactor the hub mid-removal; trim and ship.

If you hit any of these, the removal is a **2-step process**: first decouple the cross-cutting dependency in a separate PR, then run the 6-axis removal.

---

## Pre-flight before you click "delete"

- Capture baseline test counts (`pnpm test 2>&1 | grep -E "(pass|fail)"`).
- Create a git worktree (`git worktree add ../dryrun-<x>` or your tooling's equivalent) — never run the removal directly on `dev`.
- Commit on a throwaway branch after each axis if you want bisect-friendly checkpoints.
- After the migration is emitted, **read** the SQL before committing — a wrong `DROP COLUMN` on production data is irreversible.
- Validate end-to-end via `pnpm build` + `pnpm test`, then revert the worktree if this is a dry-run, or merge to `dev` if real.

---

## Removal map — `modules/api-token` (Phase C.4)

Reference cartography for removing the Personal Access Tokens module. Walk the 6-axis checklist above; this table fills in the file names.

| Axis | Touch-points |
|---|---|
| 1. **Back code** | `trash apps/api/src/modules/api-token/`. `container.ts` — remove `.addModule(apiTokenModule)` and the `import`. `index.ts` — remove `/api/v1` mount, `/api/token-scanning/*` scanning mount, and `apiTokenRoutes` + `createApiTokenScanningRoutes` imports. Remove `apps/api/src/public-api/` entirely (sub-app, no other consumers). |
| 2. **Events** | `packages/events/src/event-types.ts` — 3 types: `api_token.created`, `api_token.revoked`, `api_token.used`. `payloads.ts` — 3 payload types. `retention-map.ts` — 3 entries. `visibility-map.ts` — 3 entries (`public`, `public`, `internal`). Event count: 67 → 64. |
| 3. **Shared ports / middleware** | `apps/api/src/shared/middleware/api-token.middleware.ts` — delete (no other consumers). `apps/api/src/shared/crypto/api-token.ts` — delete (only used by `api-token.middleware.ts` and `scanning.routes.ts`). `apps/api/src/shared/middleware/auth.middleware.ts` — remove the `/api/v1/` path exclusion from `sessionMiddleware` (the sub-app bypass). `apps/api/src/shared/middleware/rate-limit.policies.ts` — remove `API_TOKEN_POLICY` + `API_TOKEN_IP_POLICY`. `apps/api/src/auth-queries.ts` — verify `findUserById` is still consumed by other modules (webhooks, admin) before removing. |
| 4. **Env vars** | `apps/api/src/shared/env.ts` — remove `API_TOKEN_PEPPER`, `API_TOKEN_PEPPER_PREVIOUS`, `API_TOKEN_PREFIX`, `API_TOKEN_MAX_EXPIRY_DAYS`, `API_TOKEN_LAST_USED_BUCKET_MIN`, `API_TOKEN_PEPPER_VERSION` and the production boot guard that requires `API_TOKEN_PEPPER`. `apps/api/.env.example` — same 6 keys. |
| 5. **Schema** | `packages/drizzle/src/schema/api-token.ts` — delete. Remove barrel re-export from `packages/drizzle/src/index.ts`. Run `pnpm db:generate` — expect 1 `DROP TABLE api_token` migration. Read the SQL before committing. |
| 6. **Access-control + front + docs** | `packages/access-control/src/index.ts` — remove `apiToken: ["create", "read", "revoke"]` from `statement` and all role definitions. `packages/emails/src/components/api-token-leaked.tsx` — delete. `packages/emails/src/render.tsx` + `src/templates.ts` — remove `api-token-leaked` entries. `apps/app/src/features/api-tokens/` — delete entirely (6 files). `apps/app/routes.ts` — remove the `route("/api-tokens", ...)` entry. `apps/app/src/shared/components/contextual-tabs.tsx` — remove "Tokens" tab entry. Docs: `FEATURES.md` (api-token section), `MODULES.md` (api-token row in shipped table), `REMOVABILITY.md` (this section), `OVERVIEW.md` (PAT paragraph), `EVENT_PIPELINE.md` (visibility-map section), `INTEGRATIONS.md` (GitHub Secret Scanning section), `README.md` (M4 note), `ROADMAP.md` (C.4 spec). |

**What you do NOT touch**:
- `shared/services/webhook-fanout-subscriber.ts` — the `isPublicEvent` guard (from `visibility-map.ts`) is called here. Once `visibility-map.ts` is gone you must inline the equivalent filtering or remove the feature guard entirely — decide before committing.
- `apps/app/src/features/developers/` (`/developers/events` catalog) — it reads `VISIBILITY` from `packages/events`. Once removed, the catalog page shows all events again (no longer filtered); this is a UI regression, not a crash. Either remove the page or drop the filter guard.

---

## Removal map — `modules/notifications` (Phase D.3)

Reference cartography for removing the in-app notification center. Walk the 6-axis checklist above.

| Axis | Touch-points |
|---|---|
| 1. **Back code** | `trash apps/api/src/modules/notifications/`. `container.ts` — remove `.addModule(notificationsModule)`, the `NotificationFanoutSubscriber` registration, and the `NotificationStreamHub` binding. `index.ts` — remove `notificationsRoutes` mount, the hub start-up call, and the internal-route mounts. `trash apps/api/src/shared/services/{notification-fanout-subscriber,notification-stream-hub,notification-trigger,resolve-audience}.ts` and `apps/api/src/shared/internal-routes/{flush-notification-emails,sweep-notifications}.route.ts`. `trash apps/api/scripts/check-fanout-preferences.ts` + its `check:fanout` script entry. |
| 2. **Events** | **No event type to remove for the inbox itself** — D.3 consumes the catalog rather than extending it. Only the 2 preference-mutation events go: `notification.preference.updated`, `notification.org_preference.updated` in `event-types.ts`, `payloads.ts`, `retention-map.ts`, `visibility-map.ts`. Event count: 67 → 65. `packages/events/src/notification-map.ts` — delete the whole projection (`NOTIFICATION_MAP`, `notificationConfigOf`, `isNotifiable`, `forcedLevelOf`, the channel/frequency/scope const arrays and their types). |
| 3. **Shared ports / cross-refs** | `packages/drizzle/src/schema/notification.ts` imports the channel/frequency/scope arrays from `@packages/events` — inline them there or delete the schema first. Check whether `@packages/events` is still a dependency of `@packages/drizzle` afterwards; if not, drop it from `packages/drizzle/package.json`. |
| 4. **Env vars** | `apps/api/src/shared/env.ts` + `.env.example` — `NOTIFICATION_RETENTION_DAYS`. |
| 5. **Schema** | `packages/drizzle/src/schema/notification.ts` — delete (both tables). Remove the barrel re-export. The `pg_notify` trigger is created at runtime by `ensureNotificationTrigger`, **not by a migration** — `pnpm db:generate` will not drop it. Drop it by hand (`DROP TRIGGER … ON notification`) before dropping the table, or the migration fails on a live database. |
| 6. **Front + docs** | `trash apps/app/src/shared/notifications/` (bell, item, matrix, grouping, labels, broadcast, stream hook) and `apps/app/src/features/notifications/`. `apps/app/src/shared/components/app-shell.tsx` — remove `<NotificationBell />`. `apps/app/routes.ts` — remove the `route("/notifications", ...)` entry. `contextual-tabs.tsx` — remove the "Notifications" tab. `features/organization/organization.route.tsx` + `components/org-notification-defaults-card.tsx` — remove the card. `shared/api/{queries,mutations}/notifications.ts` — delete. Docs: `FEATURES.md` (D.3 section), `OVERVIEW.md` (notification bullet), `EVENTS.md` (third-projection section), `CRON.md` (2 rows), `ROADMAP.md` (D.3 spec), `README.md` (M4 note), this section. |

**What you do NOT touch**:
- `shared/hooks/use-broadcast-channel.ts` — promoted out of `auth-broadcast.ts` and still used by the auth flow. Removing notifications does not orphan it.
- `EVENT_DESCRIPTIONS` in `@packages/events` — the inbox reuses it for row labels, but `/developers/events` and the webhook picker own it.
- The outbox dispatcher and its subscriber list — removing one subscriber must leave audit and webhook fan-out untouched. That is the whole point of the rail.
