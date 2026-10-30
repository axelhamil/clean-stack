# App rules

Vite 8 + React 19 + TanStack Router/Query + Tailwind 4 + shadcn (`@packages/ui`) + `sonner`; i18n with `i18next` + `react-i18next` (typed catalogs in `@packages/i18n`, locale from cookie then `user.locale`, never from the URL); Hono RPC client; BetterAuth client. Auto-loaded under `apps/app/`. Cross-cutting rules: `/CLAUDE.md`. Package rules it builds on: `packages/ui`, `packages/i18n`, `packages/access-control` (each has its own `CLAUDE.md`). Server counterpart: `apps/api/CLAUDE.md`.

## Layout

```
apps/app/
  routes.ts                     Virtual route tree: rootRoute/layout/route/index, paths relative to routesDirectory "./src"
  Caddyfile                     Serves the build and injects the CSP nonce
  a11y/                         Accessibility gate (Playwright + axe), see a11y/README.md
  src/
    main.tsx                    createRoot + <AppProviders />
    router.tsx                  createRouter({ routeTree, context: { queryClient }, preload/pending defaults }) + `watchPolicyRefusals` wiring. routeTree.gen.ts is generated but versioned
    router/                     One file per layout/gate (`__root`, `_guest`, `_protected`, `_shell`, `_admin`, `_org-scope`, `settings`) + non-route leaves (`index.route.tsx`, `settings-index.route.tsx`, `should-redirect-to-legal-accept.ts`)
    shared/                     Cross-cutting (no business): api client + errors, auth, i18n, notifications, observability, legal, hooks (see "Shared")
    features/<feature>/         Sub-domain: a vertical slice (see "Features")
```

Routing is file-based through `@tanstack/router-plugin/vite`'s `virtualRouteConfig` (`vite.config.ts`), not directory-mounted: `routes.ts` declares the tree once, so the vertical-slice layout (`features/<x>/<x>.route.tsx`) stays intact instead of being flattened into a `src/routes/` directory, and pathless layouts can wrap routes drawn from several features, which a directory cannot express.

`routeTree.gen.ts` is committed so a fresh clone type-checks without a build; regenerate it (`pnpm --filter app build` or the dev server) whenever `routes.ts` changes. **Keep `routes.ts`, `src/router/*.tsx` and `src/features/**/*.route.tsx` in `knip.json`'s `apps/app.entry`** even though the tree is versioned: knip cannot resolve the string paths passed to `virtualRouteConfig`.

## Import direction

`routes.ts` → `features/` → `shared/`. No cross-feature imports between route-owning features. No barrels.

- `routes.ts` → `router/*.tsx`, `features/<x>/<x>.route.tsx`
- `router/*.tsx` → `shared/`, `@packages/*` (features import FROM here)
- `features/<x>/` (route-owning) → `router/*.tsx`, `shared/`, `@packages/*`, `features/<library-feature>/`
- `features/<library-feature>/` → `shared/`, `@packages/*`. Never imports from other features.
- `shared/<sub>/` → `shared/<sibling>/`, `shared/env.ts`, `shared/utils.ts` (no upward imports)

**Placement decisor, two questions.** Before writing a component under `features/<x>/`, ask: (1) *is it mounted by the shell or any `shared/` code?* (2) *will a second route-owning feature render it?* Either yes → it belongs in `shared/<domain>/`. **Why**: both answers make the feature location structurally impossible, since `shared/` may never import `features/` and two route-owning features may never import each other. Group it as `shared/<domain>/` (like `auth/`, `notifications/`) once it spans more than a component or two. *Cross-cutting* is not *reusable*: reusable and presentational → `@packages/ui`; cross-cutting and app-aware → `shared/`.

## Naming

Files `kebab-case.tsx`; components `PascalCase` named exports; hooks `use-<verb>-<noun>.ts` → `useVerbNoun`; schemas `<feature>.schema.ts` → `<noun>Schema` + `<Noun>Input` (`z.infer`); props in an `interface`.

## Features

`features/<feature>/` mirrors an API module slice. **No `domain/` on the front**: UI domain isn't pure (React deps), don't fake it. Sub-folders: `api/`, `components/`, `forms/`, `hooks/`, `__tests__/`. Routes (`<name>.route.tsx`), feature-private schemas (`<feature>.schema.ts`) and label maps (`<noun>-labels.ts`) sit flat at the root. No underscore-private folders inside features (a Next.js App Router convention, it does not transfer). No sub-domains nested under area folders (`features/<area>/<feature>/`): area = layout route, feature = top-level.

1. Routes flat at the root, one `<name>.route.tsx` per page. A feature with no route (`rgpd`, `security`) is a **library feature**: it exposes components, hooks and forms to the route-owning features that mount them. A route-owning feature MAY import a library feature (the single allowed cross-feature import); the reverse never. **Why**: composition flows downward, no cyclic feature graph.
2. Components flat, grouped only when ≥ 5 files share a concern.
3. Hooks never call `fetch` directly, they go through `shared/api/api-client.ts`.
4. Schemas are Zod with `z.infer`, co-located in `features/<x>/<x>.schema.ts`; a schema a second feature needs moves to `shared/<domain>/<noun>.schema.ts`.
5. **Forms live in `forms/<action>-form.tsx`**, isolated from their host (Card/Sheet/Dialog = layout only; the form owns RHF state, `zodResolver`, validation, submit). Pages compose, forms are reusable across hosts.
6. Cross-feature reuse is not pre-solved: extract to `packages/ui` if presentational, or promote one feature to own it.
7. **Area = layout route, not folder.** A multi-page shell is a pathless layout node in `routes.ts` (`_shell`, `settings`) pointing at a `router/*.tsx` component with sidebar, tabs and `<Outlet />`; children nest under it as further entries.

## Routing: one file per route

`<name>.route.tsx` declares the route (`export const Route = createFileRoute("/full/path/id")({ ... })`, the id is a string literal that must match the id in `routes.ts`) and defines the page component inline. **The component stays internal, never exported** (`function <Name>Page() { ... }`): `autoCodeSplitting` only splits a component local to its route file, so exporting it silently pulls the page back into the main bundle. Read route state through `Route.useSearch()`, `Route.useParams()`, `Route.useRouteContext()`, never `getRouteApi`. Default preload `"intent"`.

**A new route also needs its entry in `routes.ts`**: a `<name>.route.tsx` with no entry never renders, and knip cannot see the missing wiring because those references are string paths. A new page also gets one entry in `a11y/pages.ts` (see "Accessibility gate").

## Forms and schemas

- `react-hook-form` + `zodResolver` + shadcn `Form`. Always pass `defaultValues` (no flash of uncontrolled). Submit via `form.handleSubmit((values) => mutation.mutate(values))`, never a manual `(e) => ...`.
- **Split loose vs strict for the same field.** A field *captured* in one flow (sign-in: transmit, the server validates) and *created* in another (sign-up/reset: enforce strength) needs two schemas; strength-validating sign-in locks out users with old passwords who need to log in *to change them*. Stronger guarantees → `zxcvbn-ts`, not required special characters.
- **Schemas carry no inline `message:`**; see "i18n".

## API client (Hono RPC)

One client in `shared/api/api-client.ts`: `hcWithType(baseUrl, { init: { credentials: "include" }, fetch: customFetch })`; the custom fetch injects `X-Request-Id` and is the slot for future global handlers (401 redirect, token refresh, Capacitor Bearer). Import `hcWithType` from `api/client`, not an inline `hc<AppType>` (`tsc` resolves `ApiClient` once).

- Trailing-slash normalize the `baseUrl`: `hc` drops the last segment otherwise.
- `AbortSignal` goes in the per-call second argument: `await $get({}, { init: { signal } })`.
- Types: `InferRequestType<typeof $endpoint>["json"]` + `InferResponseType<typeof $endpoint, 200>`.
- **Errors stay `throw on !res.ok`**: `ApplyGlobalResponse` widens response types but gives no discriminated union.
- **CSRF is transparent**: the API validates `Origin` (no double-submit token, no `X-CSRF-Token`); the browser sends `Origin` itself. Do not add CSRF header injection.
- **CSP nonce**: Vite's `html.cspNonce` (`vite.config.ts`) emits a `<meta property="csp-nonce">` and nonce attributes carrying a Caddy placeholder; Caddy's `templates` resolves it per request and sends the matching CSP header (`Caddyfile`). `index.html` holds no meta; the same mechanism stamps the blocking `/theme-init.js`, the only classic script, which is why it runs under `'strict-dynamic'`. Never inline the nonce in JS.

## Queries and mutations

Options factories compose better than hook wrappers: typed, prefetchable in `beforeLoad`, overridable per call site. A wrapper earns its keep only when the same side effects fire at *every* call site; otherwise (or when unsure) it is a factory. A hook doing only `return useMutation({ mutationFn })` is indirection: promote it to a factory.

| Case | Where | Form |
|---|---|---|
| Query, feature-scoped | `features/<x>/api/<x>.queries.ts` | `xxxQueryOptions` via `queryOptions(...)`; `useQuery`, and `ensureQueryData` in `beforeLoad` |
| Query, cross-feature | `shared/api/queries/<noun>.ts` | Same shape. Promote on the 2nd consumer. |
| Mutation, feature-scoped | `features/<x>/api/<x>.mutations.ts` (one file, several factories) | `<verbNoun>MutationOptions` via `mutationOptions(...)`; the call site owns side effects |
| Mutation, cross-feature or multi-step | `shared/api/mutations/<verb-noun>.ts` | Same shape |
| Mutation whose side effects always fire | `features/<x>/hooks/use-<verb>.ts` | Hook wrapping `useMutation`, owns `onSuccess`/`onError` |
| Pure React utility | `features/<x>/hooks/` or `shared/` | Plain hook |

`mutationOptions` rules (factories are objects: never prefix `use-`):

1. Side effects belong to the call site: no `toast`, `navigate` or `invalidateQueries` in the factory. `void navigate(...)` in a callback, never `await`.
2. Spread, don't override: `useMutation({ ...createXMutationOptions, onSuccess: ... })`.
3. `mutationKey` is the resource path plus the verb on every factory (`["settings", "webhooks", "update"]`), so the mutation is identifiable in devtools and by `useIsMutating`.
4. Types via `InferRequestType`/`InferResponseType<..., 200>` + `if (!res.ok) throwApiError(res, "<errors.fallback key>")`.
5. Multi-step workflows live in the factory; a single `mutationFn` returns server-verified output.
6. Single-call factories thread `init.signal`; a multi-step factory with cleanup usually can't honour cancellation, say so in the code if so.

**A cache key names every input the response varies with, the ambient ones included.** If two requests can return two different answers they get two different keys. The trap is the input not visible at the call site: the server scopes these responses on `session.activeOrganizationId`, so nothing in the URL or arguments says the answer is org-specific, and a key built from what the call site *passes* silently serves org B's answer to org A. Any query whose route carries `requireOrg`, or whose handler reads `session.activeOrganizationId`, takes the active org id as its **first factory argument** and puts it in the key: `["settings", "webhooks", organizationId, "endpoints"]`. Read it from `useActiveOrgId()` (or `ensureActiveOrgId(queryClient)` in a loader: the same value, so preloading and rendering hit one entry). **Why key it instead of clearing the cache on switch**: each org keeps its own entry, so going back is instant and correct, and a query added tomorrow cannot be forgotten from an invalidate-on-switch list. **Absence is `null`, never `undefined`** (`undefined` is dropped from a serialized key, collapsing "no org" and "org X"). When the server rejects the call without an org (`requireOrg` → 403) the factory also carries `enabled: organizationId !== null`; when `null` is a scope the server genuinely answers (personal API tokens, `getActiveMember` → `null`) there is no gate. **The guard lives in the factory, not the call site**: a call site that spreads the options and adds its own `enabled` overwrites it. **Test before merging**: change the org, come back, check the first list is right without a reload; grep every `invalidateQueries` for that key: a key that gains a segment while an invalidation keeps the old prefix is a silent no-op, so invalidate through `<factory>(organizationId).queryKey`, or an exported prefix const when you mean every org (`CURRENT_MEMBERSHIP_QUERY_PREFIX`).

## UI composition

Primitives, tokens and their authoring rules live in `packages/ui/CLAUDE.md`. As a consumer:

1. **`className` is for layout only**: `flex` (default), `w-*`, `h-*`, `mx-auto`, `gap-*`, responsive breakpoints; `grid` only for true 2D, `flex flex-col gap-*` for any vertical stack. Colors, typography, radius, shadows and look-defining paddings live in the theme or the primitive. Inline `bg-foo text-bar p-3` is theme drift.
2. **shadcn first, shadcn-pure.** Check `@packages/ui/components/ui/*` and the shadcn registry before writing custom. Use the real slots (`Card` + `CardHeader` + `CardTitle` + `CardContent`, optional `CardDescription`/`CardFooter`/`CardAction`); a wrong slot forces hacks (`pt-6`, `space-y-4`). Custom (last resort) lives in `@packages/ui`, never inline in a feature.
3. **A raw `<a className="text-...">`, `<span className="...rounded-full bg-...">` or `<div className="...rounded-lg border bg-...">` in a feature is a skipped slot or a duplicated primitive.** Promote, don't patch. Reach for:
   - **Links and nav**: `NavLink` (`plain`/`pill`/`underline`, `active`, compose via `asChild`), `TextLink` for inline links.
   - **Surfaces**: `Panel` (`asChild`, `tone`, `size`) for boxed content; `Card` is the page-level container only.
   - **Markers and text**: `Badge variant="secondary"` for numbered/iconic markers, lucide icons for list bullets, `TypographyInline` for inline muted/mono text, `CodeBlock` for `<pre>`, `CodeTextarea` for pasted machine text.
   - **Data**: `DescriptionList` (`stacked`/`inline`) for label-value pairs, `ListRow`/`ListRowButton` for rows, `CopyableValue` for copy rows (toast and labels stay in the app), `InitialsAvatar` for entity initials.
   - **Forms and dialogs**: `FormTextField`/`FormCheckboxField`, `DestructiveActionDialog` for destructive confirms, `BottomBanner` for a pinned bottom bar.
4. **Enum to copy**: a `<noun>-labels.ts` map keyed by the enum and resolved through `t()` (feature root, or `shared/<domain>/` once shared), never an inline ternary in JSX.
5. **Impersonation freeze**: any control that mutates account, org or billing state disables itself under impersonation via `useImpersonationGuard()`; spread `guard.describeProps(otherwiseDisabled)` on it, passing whatever else holds it shut (`isPending`, cooldown) so the freeze is never named as the cause of an unrelated disable.
6. **Typography**: text goes through the shadcn typography exports (named, not namespace). The page title is `<TypographyH1 variant="page">`; a settings tab whose card already carries the visible title renders `<TypographyH1 className="sr-only">` so the page keeps exactly one `<h1>`. Never a raw `<h1 className="text-2xl ...">`.
7. **Page width**: `pageContainerVariants({ width })`; call sites add only `flex`/`gap-*`/`py-*`, never a hand-picked `max-w-*` or `px-*`.
8. **Theme and dark mode**: `public/theme-init.js` sets `.dark` before first paint, `shared/theme/use-theme.ts` owns the choice afterwards; both read the same storage key, stored choice first, system otherwise. **Why a blocking script file and no React-rendered script**: a script tag in the tree needs the nonce threaded through JS, a same-origin file only needs the one Vite already stamps. The toggle uses the View Transitions API with a `prefers-reduced-motion` fallback; the view-transition CSS is in `globals.css`.

## Accessibility gate

**Exactly one `<main>` and one `<h1>` per rendered page.** `__root.tsx` and the pathless gates never wrap in landmarks: they are passthroughs (`component: Outlet`) or, when every child shares one page width, a plain container around the `Outlet` (`_admin`, like the `settings` layout). Each `<feature>.route.tsx` owns its `<header>`/`<main>`/`<footer>`. This is a CI gate (`.github/workflows/ci.yml`): a new page needs one entry in `a11y/pages.ts` (axe in light and dark, exactly one `<main>` and one `<h1>`); a new interactive primitive puts its keyboard contract in the interaction spec (`a11y/interaction.spec.ts`).

## i18n

- **No user-visible text is a literal at its call site.** Every string that reaches the DOM, a `toast()`, an `aria-label` or an email subject comes from a catalog key through `t()`. **Why**: a literal is invisible to both the type-checker and the parity gate, so it can never be translated and its absence can never be detected. **Test before merging**: search the diff for a quoted string in JSX text, in a `label`/`placeholder`/`title`/`aria-label` attribute or in a `toast` argument; if it isn't one of the exceptions below, it is wrong.
- **The three permanent exceptions**: (1) the untranslated legal prose (the policy bodies in `features/legal/policies/` and the prose in the `accessibility`, `cookies`, `data-rights` and `sub-processors` routes): per-locale content a clone-owner replaces, and **every one of those pages discloses it in the reader's own language** through `UntranslatedBodyBanner`, because what makes untranslated prose acceptable is the disclosure; (2) `EVENT_DESCRIPTIONS` in `@packages/events`, English like the rest of the API documentation; (3) the sub-processor register (`shared/sub-processors.config.ts`), English because it restates the signed DPA, though its user-facing `purpose` and `region` are translated through `common.legal.subProcessors.*` behind `shared/sub-processor-labels.ts`. Not an exception: `authorization-devtool.tsx` keeps English literals because it is dev-only (`import.meta.env.DEV`) and never reaches a user's DOM.
- **All-or-nothing per screen.** Translating half a page is worse than none: a French card above an English one reads as a bug. When a phase picks up a feature, its cards, dialogs, forms and the toasts its hooks raise move together. A feature directory and a screen are not the same unit (`/settings/privacy` drew cards from three directories).
- **Translation is read through the React tree; `getErrorsT()` is the exception, not the shortcut.** Components and hooks call `useTranslation` (that is what re-renders them on a language change). `getErrorsT()` exists only for code with no tree to read from: the global `QueryCache`/`MutationCache` handlers and `toast.ts`. One named exception: the last-resort copy of a failed request, `errors.fallback.*`: `throwApiError(res, "<key>")` takes the key and resolves it at throw time; a `toastError` fallback that is not the caller's own `t()` string goes through `errorFallback("<key>")` inside the failure callback. Both are evaluated at event time, never during render, and the key is typed against the catalog. **Why**: `getErrorsT()` resolves against whatever the instance holds *at call time* and returns the raw key before boot, so inside a component it silently stops following the language switch. **Test**: if the call site is evaluated during render, it must be `useTranslation`.
- **`changeLocale` owns the cookie write.** No call site writes the locale cookie itself. **Why**: the cookie is the pre-render signal the next page load resolves from, and more than one path changes the language (the settings switcher, the session reconciliation).
- **`LocaleSync` is mounted exactly once, in `app-providers`.** It is an effect over the session query with a `useRef` latch. **Why once**: two mounts race on the same reconciliation, each holding its own `alreadyPersisted` ref, so the "seed the empty user record" branch fires twice. The decision lives in the pure `reconcileLocale`.
- **Schemas carry no inline `message:`.** Localised validation copy comes from the global Zod map (`shared/i18n/zod-error-map.ts`), re-applied on every language change; a per-issue `message:` wins over the global map (Zod's own precedence), so an inline literal can never be translated. Custom checks pass `{ params: { i18nKey } }`.
- Catalog authoring (English first, parity, typed keys): `packages/i18n/CLAUDE.md`. A new backend error code needs its copy in the `errors` catalog in both locales: refusals render as localized copy, never raw backend text (`byCode`, then `bySuffix`, then the caller's fallback).

## Shared (`src/shared/`)

- `api/`: api-client, query-client, `queries/`, `mutations/`, `errors/` (`api-error`, `messages`, `toast`, `policy-refusal`). `policy-refusal.ts` invalidates the router on `POLICY_ACCEPTANCE_REQUIRED` so `_shell`'s existing redirect fires; never add a second redirect mechanism.
- `auth/`: auth-client, `auth-broadcast`, `Can` + `useAuthorization`, the gates (`ensure-org-permission`, `ensure-platform-admin`, `feature-gate`, `plan-gate`, `quota-gate`), `use-entitlements`, `use-active-org-id`, `use-set-active-org`, `use-refresh-session`, `use-sign-out`, `use-impersonation-guard`, role labels, `*.schema.ts`, dev-only `authorization-devtool`.
- `components/`: cross-feature UI (app-shell, org-switcher, command-palette, cookie-banner, legal-footer, consent-gate, ...). `hooks/use-consent`.
- `legal/`, `legal-routes.ts`, `sub-processors.config.ts`, `sub-processor-labels.ts`: the legal surface shared by the shell and the legal pages. `LEGAL_ROUTES` is the one list read by `legal-footer.tsx` and `command-palette.tsx`: never duplicate it.
- `notifications/`: bell, inbox item, preference matrix, grouping, labels, `notification-broadcast`, and the SSE stream hook with a stall guard (no ping for 2x the 25 s interval + 5 s → reconnect).
- `i18n/`: i18next boot, locale cookie, session reconciliation, `LocaleSync`, the global Zod error map, `useFormatDate`/`useFormatDateTime`, `useSetLocaleMutation`, `getErrorsT`, `errorFallback`.
- `observability/`: see below. `app-providers.tsx` (provider tree), `env.ts` (validated env), `utils.ts` (pure helpers), `broadcast-channel.ts` (typed cross-tab channel under `auth-broadcast` and `notification-broadcast`).

## Observability

- **Every error shown to the user also reaches telemetry, and for TanStack Query it already does.** Global `QueryCache`/`MutationCache` `onError` handlers (`observability/query-error-handler.ts`, bound in `api/query-client.ts`) capture 5xx and network errors (no `status`); expected errors (4xx incl. 401/403/404/429, `CancelledError`, `AbortError`) are filtered by `error-classifier.ts`. **Never add `captureError` to a query/mutation `onError`**: it double-reports; local `onError` is UX only (toast, redirect). Manual `captureError(err, context)` is for paths outside TanStack Query (event listeners, fire-and-forget promises).
- **Mutations capture by default; flow-control signals are an explicit allowlist** (`FLOW_CONTROL_MESSAGES` in `error-classifier.ts`). The global `MutationCache.onError` fires *before* a hook's local `onError` can swallow a flow-control throw, so those exact messages are skipped by name; hooks throw the constants exported next to the list (`PASSKEY_CANCELLED`, `EMAIL_NOT_VERIFIED_REDIRECT`, `SSO_REDIRECT_IN_PROGRESS`), never a literal of their own. **Why an allowlist and not "skip bare `Error`s"**: auth hooks wrap *every* failure, server 5xx included, in a plain `Error(message)` without `status`, so filtering on shape would silence all auth telemetry; a missed allowlist entry costs visible noise, the inverse costs invisible blind spots. A new flow-control throw exports its constant and joins the allowlist in the same PR.
- **`Sentry.setUser` is synced automatically** by `watchSession(queryClient)` (`observability/session-watcher.ts`, started module-level in `app-providers.tsx`), observing the `["session"]` query, so every auth flow is covered without touching hooks. Never call `setUser` from components or hooks. RGPD: id only. The `["session"]` key is hardcoded there on purpose (importing `sessionQueryOptions` would pull `auth-client` and `window` into non-React code and break node tests), and `state.data === undefined` is skipped because `undefined` = not resolved yet while `null` = resolved with no session, and only the latter must clear the user.
- **No direct `@sentry/react` import outside `observability/sentry.ts`.** Removability = swap the `./sentry` imports for `./noop` (see `docs/OBSERVABILITY.md`); call sites never change.

## Auth, route gates and authorization

- `shared/auth/auth-client.ts`: one `createAuthClient` with the same plugin set as the server; sessions through TanStack Query, not the auth lib's nanostore.
- **Gates are layout routes with an `id` and no path** (`_guest`, `_protected`, `_shell`, `_org-scope`), in `router/*.tsx` wired by `routes.ts`. Each owns its `beforeLoad`; children inherit via `addChildren`; the `_` prefix marks "no path contribution". Name them by access *condition*, not feature (avoid `_auth`).
- **Single source of session truth: TanStack Query, not React state.** Router context exposes only `queryClient`; gates read `ensureQueryData(sessionQueryOptions)` (stale time aligned with `cookieCache.maxAge`). No `useSession()` bridge, no race.
- **After an auth mutation, push the state into the query, then navigate.** Sign-in, verify, magic link, 2FA, profile, deletion schedule: `await refreshSession()` from `useRefreshSession()` (refetches here, then broadcasts to other tabs). Sign-out: `setQueryData(..., null)`. Then `void navigate({ to })`.
- **Token-consuming routes stay outside the gates** (attach to `rootRoute`): under `_guest` they would be redirected away the moment the token signs the user in. Token effects use `useRef(false)` against StrictMode double-fire.
- **Cross-tab sync via `BroadcastChannel`** (`auth-broadcast.ts`): any auth or org state change calls `broadcastAuthChange()`; `app-providers.tsx` listens once, runs `refetchQueries(['session','active-org','current-membership','orgs'])` and `router.invalidate()`. No payload, the cookie is shared, each tab refetches live state. Org-changing mutations (`setActive`, `create-org`, `delete-org`, `leave-org`, `transfer-and-leave`, `accept-invitation`, `remove-member`) broadcast from their call-site `onSuccess`, not the factory: a tab otherwise holds a stale `activeOrganizationId` up to `cookieCache.maxAge`.
- **`getActiveMember`/`getFullOrganization` translate `NO_ACTIVE_ORGANIZATION` to `null` at the query layer.** **Why**: BetterAuth treats "no active org" as an error, but here it is a valid transient state (between orgs, pre-self-heal); letting it bubble crashes every `ensureQueryData` consumer.
- **Capability-based authorization, one predicate, three layers** (model: `packages/access-control/CLAUDE.md`): server `requireOrgPermission`, route gate `ensureOrgPermission(permissions, { redirectTo? })` in `beforeLoad`, UI `<Can requires={...} connector?="OR" fallback?={...}>` backed by `useAuthorization().can()`. Children needing permission-aware behavior call `useAuthorization` themselves rather than receiving `canEdit: boolean` props. **One pathless `_org-scope` gates "active org required"; capabilities are per-route in `beforeLoad`**, never nested pathless tiers (`_org-admin`/`_org-owner`/...), which force every tier into the route tree.
- **Navigation declares `requires: OrgPermissions` + `requiresOrg: boolean`, not roles.** Settings tabs and command-palette entries filter via `useAuthorization().canReach(entry)`. A new org-scoped sub-route declares both at the nav source AND `ensureOrgPermission(...)` on the route (same tuple).
- **Personal org**: never special-cased except via `isPersonalOrg(slug)`; the front hides Leave/Delete, removal goes through account deletion.
- Dev-only `<AuthorizationDevTool>` (mounted in `shared/components/app-shell.tsx`, tree-shaken in prod) renders the live capability matrix.

## Cookie consent and billing gates

- **Cookie consent**: `useConsent(category)` (`shared/hooks/use-consent.ts`) for conditions and effects; `<ConsentGate category="analytics">` (`shared/components/consent-gate.tsx`) for declarative code. `<AnalyticsScripts>` is the reference application: it loads the optional `VITE_ANALYTICS_SRC` through `ConsentGate`, no-op when empty (the boilerplate tracks nothing by default). `<CookieBanner>` is auto-mounted in `app-providers.tsx`, never mount it again. **Every third-party script or pixel (analytics, chat, support, ads) is conditional on its category** through `ConsentGate` or `useConsent`; never load one directly in `index.html` or `app-providers.tsx`.
- **Entitlements**: the front never re-declares the plan table. `useEntitlements()` reads the server-resolved `GET /billing/subscription`; `<FeatureGate feature>` and `<PlanGate min>` (rank-based) render children by that view; `shared/api/queries/billing-types.ts` is the shared wire contract (`Tier`, `Feature`, `PlanCatalogItem`, `EntitlementsView`), never duplicated in features. `authClient.subscription` is deliberately loosely typed (a cast keeps the Stripe server SDK out of the app workspace): consume entitlements via the typed endpoint instead.
- **Quotas**: `useQuota(key, used)` → `{ limit, used, remaining, exceeded }` (the caller passes `used`, counting is server-side) and `<QuotaGate quotaKey used fallback>` (`shared/auth/quota-gate.tsx`). Enforcement is backend-only (`requireQuota`/`reserveQuota`); these are UX. Dormant and knip-whitelisted, like `FeatureGate`/`PlanGate`.

## Commands

`pnpm --filter app test` (vitest) · `pnpm --filter app type-check` (app + `a11y/` project) · `pnpm turbo run check:a11y --filter=app` (Playwright + axe over the preview build, needs a running API, see `a11y/README.md`).
