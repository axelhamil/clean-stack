# Admin rules

The staff back office, on its own host, against the same API under `/admin/*`. Frontend rules are those of `apps/app/CLAUDE.md` (layout, routing, queries, UI composition, i18n, observability); this file holds only what differs. Cross-cutting rules: `/CLAUDE.md`.

## Rules

1. **The UI is built from the `permissions` of `GET /admin/me`, never a role and never recomputed.** Section list and route gate read one table (`shared/nav/sections.ts`). **Why**: per-person grants and denials exist, a role check would show what the server refuses and hide what it grants. The API stays the enforcement.
2. **A section the permissions do not open answers like a section that does not exist**, and the denied page names nothing of the back office. **Why**: what staff can do is itself information; a non-staff visitor learns only that this account is refused.
3. **No auth screen here.** A `401` from `/admin/me` goes to `VITE_APP_URL/sign-in?redirect=<this page>`; the customer app is the one sign-in surface. It accepts this host because its `VITE_ADMIN_URL` is the only external target of `safe-redirect`, so a new host means changing that value too.
4. **`/admin/me` is refetched at every navigation and tab return** (`staleTime: 0`), and any access refusal rechecks it (`watch-access-refusals`). **Why**: a removed role must cut at once, not at the next reload.
5. **Never import `apps/app`** (`check:boundaries`). What both apps need is promoted to a package. `StepUpGate` is the shape: logic in `@packages/web-kit/auth/use-step-up-dialog`, dialog in `@packages/ui`, one line here.
6. **Locale comes from the cookie, then the browser.** No session reconciliation here yet, and the cookie is per host in production.

## Accessibility gate

`a11y/`, same contract as the app's (`apps/app/a11y/README.md`), on the preview build at `:4174`, with the app's preview at `:4173` because the setup is the real round trip through its sign-in. A new page gets one entry in `a11y/pages.ts`; a new interactive primitive its keyboard contract in `a11y/interaction.spec.ts`. The setup spends the run's only real sign-in, so permission cases fulfil `/admin/me` instead of signing in as another person. Both previews must be built with `VITE_ADMIN_URL=http://localhost:4174` and `VITE_APP_URL=http://localhost:4173`, the API with `ADMIN_URL=http://localhost:4174` and `APP_URL=http://localhost:4173`. Accounts come from `pnpm --filter api db:seed` (`scripts/seed-staff.ts`).

## CSP

Same mechanism as the app (Vite `html.cspNonce`, Caddy `templates`), stricter policy in `Caddyfile`: no third-party script or image, `connect-src` limited to the API, plus `noindex`. `VITE_API_URL` must exist at runtime for Caddy, `CSP_CONNECT_EXTRA` adds the Sentry host when a DSN is set.

## Commands

`pnpm --filter admin dev` (`:5174`) · `pnpm --filter admin test` · `pnpm --filter admin type-check` · `pnpm turbo run check:a11y --filter=admin`.
