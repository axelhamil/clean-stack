# Shared (front)

Loaded when working inside `apps/app/src/shared/`. Auth client, API client, route gates, authorization, org-scoping front. App-wide rules in `apps/app/CLAUDE.md`.

## What lives here

- `api/` — api-client, query-client, queries/, mutations/, errors/ (`api-error`, `messages`, `toast`, `policy-refusal`). Refusals render as localized copy, never raw backend text: the error code resolves through the `errors` catalog (`byCode`, then `bySuffix`, then the caller's fallback), so a new backend code needs its copy in both `en` and `fr`. `policy-refusal.ts` invalidates the router on `POLICY_ACCEPTANCE_REQUIRED` so `_shell`'s existing redirect fires; never add a second redirect mechanism.
- `auth/` — auth-client, auth-broadcast, `Can` + `useAuthorization`, gates (`ensure-org-permission`, `ensure-platform-admin`, `feature-gate`, `plan-gate`, `quota-gate`), `use-entitlements`, `use-active-org-id`, `use-set-active-org`, `use-sign-out`, `use-impersonation-guard`, role-labels, `*.schema.ts`, dev-only `authorization-devtool`
- `components/` — cross-feature UI (app-shell, org-switcher, command-palette, cookie-banner, legal-footer, secret-reveal-dialog, pricing-table, impersonation-banner, …)
- `hooks/` — `use-consent`, `use-broadcast-channel`
- `legal/`, `legal-routes.ts`, `sub-processors.config.ts`, `sub-processor-labels.ts` — legal surface shared by the shell and the legal pages
- `notifications/` — bell + inbox item, preference matrix, grouping, labels, `notification-broadcast`, SSE stream hook with a stall guard (no ping for 2x the 25 s interval + 5 s → reconnect)
- `i18n/` — i18next boot (`i18n.ts`), locale cookie, session reconciliation, `LocaleSync`, the global Zod error map, `useFormatDate`/`useFormatDateTime`, `useSetLocaleMutation`, `getErrorsT` and `errorFallback` (see the i18n rule below)
- `observability/` — sentry.ts (init + captureError/addBreadcrumb/setUser/ErrorBoundary/reactErrorHandler) + noop.ts mirror, error-classifier, query-error-handler (QueryCache/MutationCache onError), session-watcher (setUser sync)
- `app-providers.tsx` — provider tree
- `env.ts` — validated env
- `utils.ts` — pure helpers

## Hono RPC client

Single client lives in `shared/api/api-client.ts`: `hcWithType(baseUrl, { init: { credentials: "include" }, fetch: customFetch })`. Custom fetch injects `X-Request-Id` and is the slot for future global handlers (401 redirect, token refresh, Capacitor Bearer). **`hcWithType` from `api/client`, not inline `hc<AppType>`** — `tsc` resolves `ApiClient` once. **Errors stay `throw on !res.ok`** — `ApplyGlobalResponse` widens response types but no discriminated union.

**CSRF is transparent on the front** — the API uses Origin-based validation (no double-submit token, no `X-CSRF-Token` header). The browser sends the `Origin` header automatically on every cross-origin fetch; the api-client injects nothing extra for CSRF. Do **not** add `X-CSRF-Token` injection.

## CSP nonce

Vite's `html.cspNonce` (`vite.config.ts`) emits a `<meta property="csp-nonce">` and nonce attributes carrying a Caddy placeholder at build time; Caddy's `templates` resolves it to `{http.request.uuid}` per request and sends the matching CSP header (`apps/app/Caddyfile`). `index.html` itself holds no meta. `app-providers.tsx` reads the nonce from the `<meta>` attribute (IDL `.nonce` is empty on meta — must use `.getAttribute("nonce")`) and passes it to `ThemeProvider`. Do **not** read via `.nonce` IDL; do **not** inline the nonce in JS.

## Observability (front)

- **Every error shown to the user must also reach telemetry — and it already does for TanStack Query.** Global `QueryCache`/`MutationCache` `onError` handlers (`observability/query-error-handler.ts`, bound in `api/query-client.ts`) capture every unexpected failure: 5xx and network errors (no `status`). Expected errors — 4xx (validation, 401/403/404, 429 rate-limit), `CancelledError`, `AbortError` — are filtered by `error-classifier.ts`. **Never add `captureError` to a mutation/query `onError` callback** — it would double-report; local `onError` is for UX (toast, redirect) only. Manual `captureError(err, context)` is reserved for code paths outside TanStack Query (event listeners, fire-and-forget promises).
- **Mutations capture by default; flow-control signals are an explicit allowlist** (`FLOW_CONTROL_MESSAGES` in `error-classifier.ts`). The global `MutationCache.onError` fires *before* the hook's local `onError` can swallow a flow-control throw (passkey cancel, email-not-verified redirect, SSO redirect in progress), so those exact messages are skipped by name. The hooks throw the constants exported next to the allowlist (`PASSKEY_CANCELLED`, `EMAIL_NOT_VERIFIED_REDIRECT`, `SSO_REDIRECT_IN_PROGRESS`), never a literal of their own, so a thrown signal cannot drift from the list. **Why an allowlist and not "skip bare `Error`s"**: auth hooks wrap *every* failure — including server 5xx — in a plain `Error(message)` without `status`; filtering on shape would silence all auth telemetry. A missed allowlist entry costs visible noise (add the message); the inverse costs invisible blind spots. New flow-control throw in a mutation → export its constant from `error-classifier.ts` and add it to the allowlist in the same PR.
- **`Sentry.setUser` is synced automatically** by `watchSession(queryClient)` (`observability/session-watcher.ts`), started module-level in `app-providers.tsx`. It observes the `["session"]` query — the single source of session truth — so every auth flow (password, magic link, passkey, restore, sign-out) is covered without touching auth hooks. Never call `setUser` from components or hooks. RGPD: id only.
- **No direct `@sentry/react` import outside `observability/sentry.ts`.** Removability = swap the `./sentry` imports to `./noop` (see `docs/OBSERVABILITY.md`); call sites never change.
- **The `["session"]` key is intentionally hardcoded in `session-watcher.ts`** — importing `sessionQueryOptions` would pull `auth-client` (and `window`) into non-React code and break node tests. **Why** `state.data === undefined` is skipped there: `undefined` = query not resolved yet, `null` = resolved with no session; only the latter must clear the Sentry user.

## i18n (front)

- **Translation is read through the React tree; `getErrorsT()` is the exception, not the shortcut.** Components and hooks call `useTranslation` — that is what re-renders them when the language changes. `getErrorsT()` exists only for code that has no tree to read from: the global `QueryCache`/`MutationCache` handlers and `toast.ts` run outside React entirely. **One named exception**: the last-resort copy of a failed request, `errors.fallback.*`. `throwApiError(res, "<key>")` takes the key itself and resolves it at throw time; a `toastError` fallback that is not the caller's own `t()` string goes through `errorFallback("<key>")`, called inside the failure callback. Both are evaluated at event time, never during render, and the key is typed against the catalog, so a missing entry fails the build instead of shipping a raw key. **Why it matters which one you reach for**: `getErrorsT()` resolves against whatever the instance holds *at call time* and returns the raw key before boot, so using it inside a component produces copy that silently stops following the language switch. **Test**: if the call site is inside a component or a hook and is evaluated during render, it must be `useTranslation`.
- **`changeLocale` owns the cookie write.** No call site writes the locale cookie itself. **Why**: the cookie is the pre-render signal the next page load resolves from, so a path that changes the language without leaving that trace boots the next visit in the old one — and there is more than one such path (the settings switcher and the session reconciliation both change it).
- **`LocaleSync` is mounted exactly once, in `app-providers`.** It is an effect over the session query with a `useRef` latch, not a pure view. **Why once**: two mounts race on the same reconciliation and each holds its own `alreadyPersisted` ref, so the "seed the empty user record" branch fires twice and issues two writes for one decision. The decision itself lives in `reconcileLocale`, a pure function, so "does a save bounce back?" is answerable in a unit test with no DOM.
- **Schemas carry no inline `message:`.** Localised validation copy comes from the global Zod map (`i18n/zod-error-map.ts`), re-applied on every language change. A per-issue `message:` wins over the global map — that is Zod's own precedence — so an inline literal is a string that can never be translated. Custom checks pass `{ params: { i18nKey } }` instead, which is what routes them back through the catalog.

## Auth (BetterAuth client)

`shared/auth/auth-client.ts`: one `createAuthClient` with same plugin set as server; sessions via TanStack Query, not auth-lib nanostore.

## Route gates (in `apps/app/src/router/*.tsx`, wired via `apps/app/routes.ts`)

Auth state enforced by **layout routes with `id` (no path)** — `_guest`, `_protected`, `_shell`, `_org-scope`. Each owns its `beforeLoad`. Children inherit via `addChildren`. The `_` prefix marks "no path contribution". Naming by access *condition*, not feature — avoid `_auth` (ambiguous).

**Single source of session truth — TanStack Query, not React state.** Router context exposes only `queryClient`. Gates' `beforeLoad` reads `ensureQueryData(sessionQueryOptions)` (staleTime aligned with `cookieCache.maxAge`). No `useSession()` React bridge, no race.

**After auth mutations, push state into the query, then navigate.** Sign-in/verify/magic-link/2FA: `await queryClient.refetchQueries({ queryKey: sessionQueryOptions.queryKey })`. Sign-out: `setQueryData(..., null)`. Then `void navigate({ to })`.

**Token-consuming routes stay outside the gates** — attach to `rootRoute` directly. Under `_guest` they'd be 302'd away the moment the token signs the user in. Token effects use `useRef(false)` against StrictMode double-fire.

**Realtime cross-tab sync via `BroadcastChannel`** — `shared/auth/auth-broadcast.ts` (~15 LoC, native, stable since 2017). Mutations call `broadcastAuthChange()`; `app-providers.tsx` listens once and `refetchQueries(['session','active-org','current-membership','orgs'])`+`router.invalidate()`. No payload — cookie shared, each tab refetches live state. Use for **any** auth/org state change.

**Per-route capability gates use `ensureOrgPermission(...)`, not nested pathless layouts.** One pathless `_org-scope` gates "active org required"; capabilities live per-route in `beforeLoad`. **Why**: stacking `_org-admin`/`_org-owner`/`_can-manage-billing` forces every tier into the directory tree. Customize via `ensureOrgPermission(perms, { redirectTo })`.

**The route file's page component stays internal, never exported**: the rule and its why live in `src/features/CLAUDE.md` (Routing).

## Authorization (capability-based, front)

Defined once in `@packages/access-control` — same `OrgPermissions` shape, same roles as server. Three layers, one predicate:
- **Server** `requireOrgPermission(permissions)` (see `apps/api/CLAUDE.md`)
- **Route gate** `ensureOrgPermission(permissions)` in `beforeLoad`
- **UI** `<Can requires={...} connector?="OR" fallback?={...}>` backed by `useAuthorization().can()`

**Why**: defense in depth — server enforces, gate prevents access, UI hides unreachable controls. Children needing permission-aware behavior call `useAuthorization` themselves rather than receiving `canEdit: boolean` props. Dev-only `<AuthorizationDevTool>` (mounted in `shared/components/app-shell.tsx`, tree-shaken in prod) renders live capability matrix.

## Cookie consent

Three primitives apply consent in front code:

1. **`useConsent(category: ConsentCategory): boolean`** (`shared/hooks/use-consent.ts`): imperative hook, for conditions and `useEffect` where JSX is not available.
2. **`<ConsentGate category="analytics">`** (`shared/components/consent-gate.tsx`): declarative wrapper that renders its children only when the category is consented. Default choice for declarative code.
3. **`<AnalyticsScripts>`** (`shared/components/analytics-scripts.tsx`): reference application of the pattern. Loads `VITE_ANALYTICS_SRC` (optional env) through `<ConsentGate category="analytics">`, React cleanup on unmount/withdraw, mounted in `app-providers.tsx`. Empty env = no-op component, the boilerplate tracks nothing by default.

**`<CookieBanner>`** (`shared/components/cookie-banner.tsx`) is auto-mounted in `app-providers.tsx`; never mount it again in a feature. It hides itself once `consentQueryOptions` returns a current state.

**`<LegalFooter>`** (`shared/components/legal-footer.tsx`) is mounted in `AppShell` for signed-in users and reads `LEGAL_ROUTES` from `shared/legal-routes.ts`, the same const as `command-palette.tsx`. **Never duplicate the legal route list**: edit `LEGAL_ROUTES` and both surfaces follow.

**Analytics integration pattern** (cloning a tool):
```tsx
// shared/env.ts already exposes VITE_ANALYTICS_SRC
<ConsentGate category="analytics">
  <script async src={env.VITE_ANALYTICS_SRC} data-website-id="..." />
</ConsentGate>
```

**Rule**: every third-party script or pixel (analytics, chat, support, ads) is conditional on its category through `<ConsentGate>` or `useConsent`. Never load a third-party script directly in `index.html` or `app-providers.tsx` without a consent gate.

## Billing entitlements

Three primitives for gating features and plans in front code:

1. **`useEntitlements(): EntitlementsView`** — imperative hook. Server-resolved via `GET /billing/subscription`; the front **never re-declares** the `ENTITLEMENTS` config table.
2. **`<FeatureGate feature="...">`** — declarative JSX wrapper, renders children only if the entitlement flag is active for the current org tier.
3. **`<PlanGate min="pro">`** — renders children only if active tier ≥ `min` (rank-based comparison from server-resolved view).

**`shared/api/queries/billing-types.ts`** is the shared wire contract (`Tier` / `Feature` / `PlanCatalogItem` / `EntitlementsView`). Never duplicate these types in features.

**`authClient.subscription`** is deliberately loosely typed (cast keeps the Stripe SERVER SDK out of the app workspace). Consume entitlements via the `GET /billing/subscription` typed endpoint, not `authClient.subscription` directly.

## Quota gating

Symmetric to feature/plan gating, over `ENTITLEMENTS[tier].quotas` (exposed on the same `GET /billing/subscription` view):

1. **`useQuota(key, used): { limit, used, remaining, exceeded }`** — imperative hook (from `useEntitlements()`). `used` is passed in by the caller (usage counting is server-side; the front never re-declares quota limits).
2. **`<QuotaGate quotaKey used fallback>`** (`shared/auth/quota-gate.tsx`) — declarative wrapper, renders `fallback` when `exceeded`, children otherwise.

Enforcement is backend-only (`requireQuota`/`reserveQuota`); these front primitives are UX (show remaining, hide/limit CTA). Dormant + knip-whitelisted (like `<FeatureGate>`/`<PlanGate>`).

## Org-scoping (front)

1. **Org-changing mutations broadcast `broadcastAuthChange()` from call-site `onSuccess`** (not the factory): `setActive`, `create-org`, `delete-org`, `leave-org`, `transfer-and-leave`, `accept-invitation`, `remove-member`. **Why**: a tab holds stale `activeOrganizationId` up to `cookieCache.maxAge` (5 min) without a signal.
2. **`getActiveMember`/`getFullOrganization` translate `NO_ACTIVE_ORGANIZATION` to `null` at query layer.** Active-org/membership query options catch the code, return `null`. **Why**: BetterAuth treats "no active org" as error, but in our model it's a valid transient state (between orgs, pre-self-heal). Letting it bubble crashes every `ensureQueryData` consumer.
3. **Navigation declares `requires: OrgPermissions`+`requiresOrg: boolean`, not roles.** Settings tabs and command-palette routes filter via `useAuthorization().can(requires)`+`hasMembership`. New org-scoped sub-route → declare both at nav source AND `ensureOrgPermission(...)` on the route file (same tuple).
4. **Personal org never special-cased except via `isPersonalOrg(slug)`** (`slug = personal-${orgId}`). Front hides Leave/Delete; removal goes via account deletion.
5. **A cache key names every input the response varies with — the ambient ones included.** If two different requests can return two different answers, they get two different keys. The trap is the input that is not visible at the call site: the server scopes these responses on `session.activeOrganizationId`, so nothing in the URL, the arguments or the function name says the answer is org-specific — and a key built from what the call site *passes* silently serves org B's answer to org A. Any query whose route carries `requireOrg`, or whose handler reads `session.activeOrganizationId`, takes the active org id as its **first factory argument** and puts it in the key: `queryKey: ["settings", "webhooks", organizationId, "endpoints"]`. Read it from `useActiveOrgId()` (or `ensureActiveOrgId(queryClient)` in a loader — the same value, so preloading and rendering hit one entry, not two). **Why key it instead of clearing the cache on switch**: each org keeps its own entry, so going back is instant *and* correct, and a query added tomorrow cannot be forgotten from an invalidate-on-switch list — the list is the failure mode, the key is not. **Absence is `null`, never `undefined`** — `undefined` is dropped from a serialized key, collapsing "no org" and "org X" onto one entry, which is the very bug being avoided. When the server rejects the call without an org (`requireOrg` → 403), the factory also carries `enabled: organizationId !== null`; when `null` is a scope the server genuinely answers (personal API tokens, `getActiveMember` → `null`), there is no gate and the `null` entry is a legitimate cached answer. **The guard lives in the factory, not the call site** — a call site that spreads the options and adds its own `enabled` overwrites the org guard. **Test before merging**: change the org, come back, and check the first list is right without a reload; and grep every `invalidateQueries` for that key — a key that gains a segment while an invalidation keeps the old prefix is a silent no-op, so invalidate through `<factory>(organizationId).queryKey`, or through an exported prefix const when you deliberately mean every org (`CURRENT_MEMBERSHIP_QUERY_PREFIX`).
