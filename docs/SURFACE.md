# Back ↔ front surface map

`apps/api/src/shared/surface/route-map.ts` records, for every live HTTP route, either the front file
that calls it or the reason it has no UI consumer. It is the answer to "is this endpoint reachable
from the product, and if not, why not".

**It cannot rot.** `surface-parity.test.ts` reads the *live* route table off the Hono app
(`app.routes`), scans `apps/app/src` for client call sites, and fails when a route is missing from
the map, when the map names a route that no longer exists, when a route declared UI-less turns out
to be called, or when a declared consumer stops calling it. Adding a route without declaring it
breaks the build.

**Adding a route**: add the route, run `pnpm --filter api test src/shared/surface`, and add the row
the failure names — a consumer path if a screen calls it, or a `UiLessReason` if none should.

**What is deliberately not enumerated**: `/api/auth/*`. BetterAuth builds its own route table inside
`better-call` and does not export it; only SSO and SCIM paths are frozen, in
`apps/api/src/shared/auth/sso-paths.ts`. The wildcard is one `library-owned` row, and the front's 53
`authClient` calls are its consumers.

**Running the test**: `back-routes.ts` imports the app, which loads `shared/env.ts` (Zod-validated) —
so `bun test` needs `DATABASE_URL`/`BETTER_AUTH_URL`/`BETTER_AUTH_SECRET`/`APP_URL` populated. Run via
`pnpm --filter api test src/shared/surface` from the repo root (it picks up `apps/api/.env`), not a
bare `bun -e` from the root, which has no env file to load.

## Backend capabilities with no HTTP surface

Some modules ship no route at all, so `app.routes` can never list them and the map above cannot
carry them. They are declared here instead, as a human claim clearly labelled as one:

- **`apps/api/src/modules/quotas/`** — a store-only infra module (`IQuotaUsageStore` + the
  `quota_usage` table). It has no `routes.ts` and is never mounted. Its consumers are
  `reserveQuota`/`requireQuota` (`shared/{db/quota-reservation,middleware/billing.middleware}.ts`),
  themselves dormant until a clone gates a resource. See `docs/QUOTA-GATING.md`.
