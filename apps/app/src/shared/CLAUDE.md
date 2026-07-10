# Shared (front)

Loaded when working inside `apps/app/src/shared/`. Auth client, API client, route gates, authorization, org-scoping front. App-wide rules in `apps/app/CLAUDE.md`.

## What lives here

- `api/` — api-client, query-client, queries/, mutations/, errors/
- `auth/` — auth-client, auth-broadcast, can, use-authorization, use-set-active-org, use-sign-out, schemas/
- `components/` — cross-feature UI (app-shell, org-switcher, command-palette, …)
- `observability/` — sentry.ts (init + captureError/addBreadcrumb/setUser/ErrorBoundary/reactErrorHandler) + noop.ts mirror, error-classifier, query-error-handler (QueryCache/MutationCache onError), session-watcher (setUser sync)
- `app-providers.tsx` — provider tree
- `env.ts` — validated env
- `utils.ts` — pure helpers

## Hono RPC client

Single client lives in `shared/api/api-client.ts`: `hcWithType(baseUrl, { init: { credentials: "include" }, fetch: customFetch })`. Custom fetch injects `X-Request-Id` and is the slot for future global handlers (401 redirect, token refresh, Capacitor Bearer). **`hcWithType` from `api/client`, not inline `hc<AppType>`** — `tsc` resolves `ApiClient` once. **Errors stay `throw on !res.ok`** — `ApplyGlobalResponse` widens response types but no discriminated union.

**CSRF is transparent on the front** — the API uses Origin-based validation (no double-submit token, no `X-CSRF-Token` header). The browser sends the `Origin` header automatically on every cross-origin fetch; the api-client injects nothing extra for CSRF. Do **not** add `X-CSRF-Token` injection.

## CSP nonce

Caddy injects the nonce via `{http.request.uuid}` into `<meta property="csp-nonce" nonce="...">` in `index.html` (see `apps/app/Caddyfile`). Vite propagates it through `html.cspNonce` in `vite.config.ts`. `app-providers.tsx` reads the nonce from the `<meta>` attribute (IDL `.nonce` is empty on meta — must use `.getAttribute("nonce")`) and passes it to `ThemeProvider`. Do **not** read via `.nonce` IDL; do **not** inline the nonce in JS.

## Observability (front)

- **Every error shown to the user must also reach telemetry — and it already does for TanStack Query.** Global `QueryCache`/`MutationCache` `onError` handlers (`observability/query-error-handler.ts`, bound in `api/query-client.ts`) capture every unexpected failure: 5xx and network errors (no `status`). Expected errors — 4xx (validation, 401/403/404, 429 rate-limit), `CancelledError`, `AbortError` — are filtered by `error-classifier.ts`. **Never add `captureError` to a mutation/query `onError` callback** — it would double-report; local `onError` is for UX (toast, redirect) only. Manual `captureError(err, context)` is reserved for code paths outside TanStack Query (event listeners, fire-and-forget promises).
- **Mutations capture by default; flow-control signals are an explicit allowlist** (`FLOW_CONTROL_MESSAGES` in `error-classifier.ts`). The global `MutationCache.onError` fires *before* the hook's local `onError` can swallow a flow-control throw (`new Error("Cancelled")` on passkey cancel, `email-not-verified-redirect`), so those exact messages are skipped by name. **Why an allowlist and not "skip bare `Error`s"**: auth hooks wrap *every* failure — including server 5xx — in a plain `Error(message)` without `status`; filtering on shape would silence all auth telemetry. A missed allowlist entry costs visible noise (add the message); the inverse costs invisible blind spots. New flow-control throw in a mutation → add its message to the allowlist in the same PR.
- **`Sentry.setUser` is synced automatically** by `watchSession(queryClient)` (`observability/session-watcher.ts`), started module-level in `app-providers.tsx`. It observes the `["session"]` query — the single source of session truth — so every auth flow (password, magic link, passkey, restore, sign-out) is covered without touching auth hooks. Never call `setUser` from components or hooks. RGPD: id only.
- **No direct `@sentry/react` import outside `observability/sentry.ts`.** Removability = swap the `./sentry` imports to `./noop` (see `docs/OBSERVABILITY.md`); call sites never change.
- **The `["session"]` key is intentionally hardcoded in `session-watcher.ts`** — importing `sessionQueryOptions` would pull `auth-client` (and `window`) into non-React code and break node tests. **Why** `state.data === undefined` is skipped there: `undefined` = query not resolved yet, `null` = resolved with no session; only the latter must clear the Sentry user.

## Auth (BetterAuth client)

`shared/auth/auth-client.ts`: one `createAuthClient` with same plugin set as server; sessions via TanStack Query, not auth-lib nanostore.

## Route gates (in `router/layouts.tsx` + `router.tsx`)

Auth state enforced by **layout routes with `id` (no path)** — `_guest`, `_protected`, `_shell`, `_org-scope`. Each owns its `beforeLoad`. Children inherit via `addChildren`. The `_` prefix marks "no path contribution". Naming by access *condition*, not feature — avoid `_auth` (ambiguous).

**Single source of session truth — TanStack Query, not React state.** Router context exposes only `queryClient`. Gates' `beforeLoad` reads `ensureQueryData(sessionQueryOptions)` (staleTime aligned with `cookieCache.maxAge`). No `useSession()` React bridge, no race.

**After auth mutations, push state into the query, then navigate.** Sign-in/verify/magic-link/2FA: `await queryClient.refetchQueries({ queryKey: sessionQueryOptions.queryKey })`. Sign-out: `setQueryData(..., null)`. Then `void navigate({ to })`.

**Token-consuming routes stay outside the gates** — attach to `rootRoute` directly. Under `_guest` they'd be 302'd away the moment the token signs the user in. Token effects use `useRef(false)` against StrictMode double-fire.

**Realtime cross-tab sync via `BroadcastChannel`** — `shared/auth/auth-broadcast.ts` (~15 LoC, native, stable since 2017). Mutations call `broadcastAuthChange()`; `app-providers.tsx` listens once and `refetchQueries(['session','active-org','current-membership','orgs'])`+`router.invalidate()`. No payload — cookie shared, each tab refetches live state. Use for **any** auth/org state change.

**Per-route capability gates use `ensureOrgPermission(...)`, not nested pathless layouts.** One pathless `_org-scope` gates "active org required"; capabilities live per-route in `beforeLoad`. **Why**: stacking `_org-admin`/`_org-owner`/`_can-manage-billing` forces every tier into the directory tree. Customize via `ensureOrgPermission(perms, { redirectTo })`.

**Don't static-import the route binding from a page file** (`import { xxxRoute } from "./xxx.route"`) — creates a cycle Biome flags. Pages access route via `getRouteApi("/path/id")`.

## Authorization (capability-based, front)

Defined once in `@packages/access-control` — same `OrgPermissions` shape, same roles as server. Three layers, one predicate:
- **Route gate** `ensureOrgPermission(permissions)` in `beforeLoad`
- **UI** `<Can requires={...} connector?="OR" fallback?={...}>` backed by `useAuthorization().can()`

**Why**: defense in depth — server enforces, gate prevents access, UI hides unreachable controls. Children needing permission-aware behavior call `useAuthorization` themselves rather than receiving `canEdit: boolean` props. Dev-only `<AuthorizationDevTool>` (mounted in `__root.tsx`, tree-shaken in prod) renders live capability matrix.

## Cookie consent (Phase A.4)

Trois primitifs pour appliquer le consentement dans le code front :

1. **`useConsent(category: ConsentCategory): boolean`** (`shared/hooks/use-consent.ts`) — hook impératif. Usage : dans du code impératif (conditions, `useEffect`, etc.) où JSX n'est pas disponible.

2. **`<ConsentGate category="analytics">`** (`shared/components/consent-gate.tsx`) — primitif déclaratif. Usage : wrapper JSX qui rend ses enfants seulement si la catégorie est consentie. Recommandé par défaut pour le code déclaratif.

3. **`<AnalyticsScripts>`** (`shared/components/analytics-scripts.tsx`) — **exemple d'application** du pattern. Charge le script `VITE_ANALYTICS_SRC` (env optionnel) via `<ConsentGate category="analytics">`, cleanup React au unmount/withdraw. Monté dans `app-providers.tsx`. Env vide = composant no-op, le boilerplate ne trace rien par défaut.

**`<CookieBanner>`** (`shared/components/cookie-banner.tsx`) est auto-monté dans `app-providers.tsx` — ne pas le remonter dans les features. Il se masque automatiquement quand `consentQueryOptions` retourne un état courant.

**`<LegalFooter>`** (`shared/components/legal-footer.tsx`) est monté dans `AppShell` pour les users connectés. Il source `shared/legal-routes.ts` (`LEGAL_ROUTES`) — la même const que `command-palette.tsx` (DRY). **Ne pas dupliquer la liste des routes légales** : modifier `LEGAL_ROUTES` dans `shared/legal-routes.ts`, les deux surfaces se mettent à jour.

**Pattern d'intégration analytics** (cloner un outil) :
```tsx
// shared/env.ts expose déjà VITE_ANALYTICS_SRC
// Suffit de brancher le script dans <AnalyticsScripts> ou un composant similaire
<ConsentGate category="analytics">
  <script async src={env.VITE_ANALYTICS_SRC} data-website-id="..." />
</ConsentGate>
```

**Règle** : tout script ou pixel tiers (analytics, chat, support, publicité) doit être conditionnel à la catégorie appropriée via `<ConsentGate>` ou `useConsent`. Ne pas charger un script tiers directement dans `index.html` ou `app-providers.tsx` sans gate de consentement.

## Org-scoping (front)

1. **Org-changing mutations broadcast `broadcastAuthChange()` from call-site `onSuccess`** (not the factory): `setActive`, `create-org`, `delete-org`, `leave-org`, `transfer-and-leave`, `accept-invitation`, `remove-member`. **Why**: a tab holds stale `activeOrganizationId` up to `cookieCache.maxAge` (5 min) without a signal.
2. **`getActiveMember`/`getFullOrganization` translate `NO_ACTIVE_ORGANIZATION` to `null` at query layer.** Active-org/membership query options catch the code, return `null`. **Why**: BetterAuth treats "no active org" as error, but in our model it's a valid transient state (between orgs, pre-self-heal). Letting it bubble crashes every `ensureQueryData` consumer.
3. **Navigation declares `requires: OrgPermissions`+`requiresOrg: boolean`, not roles.** Settings tabs and command-palette routes filter via `useAuthorization().can(requires)`+`hasMembership`. New org-scoped sub-route → declare both at nav source AND `ensureOrgPermission(...)` on the route file (same tuple).
4. **Personal org never special-cased except via `isPersonalOrg(slug)`** (`slug = personal-${orgId}`). Front hides Leave/Delete; removal goes via account deletion.
