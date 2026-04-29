# CLAUDE.md

Generic monorepo boilerplate. Clean Architecture + DDD. No business features.

## Philosophy

Lean Startup — **Build → Measure → Learn**. The bottleneck is *Build*, so this stack ships SaaS plumbing (auth, billing, multi-tenant, email, storage) and isolates the domain so pivots don't trash the foundation. "Done > perfect" applies to features; the rules below stay non-negotiable — they're what *makes* shipping fast sustainable.

## Working method

When unclear about a library API / config / "is this still SOTA" — **check docs before guessing**. Outdated patterns are a frequent failure mode.

1. **Primary**: Context7 MCP via `explore-docs` agent.
2. **Fallback**: web search via `websearch` agent / `WebFetch`.

## Stack

- **Runtime**: Bun 1.3+ (api + scripts), Node 24.15+ (tooling)
- **API**: Hono on native `Bun.serve()` — `bun build` (prod), `bun --hot` (dev)
- **App**: Vite 8 + React 19 + TanStack Router/Query + Tailwind 4
- **UI**: shadcn/ui (`@packages/ui`) + `sonner` + `next-themes`
- **DB**: Drizzle + Postgres 17 (Docker, port `5433`)
- **DI**: `inwire` (type-inference container)
- **Auth**: BetterAuth (Drizzle adapter + `twoFactor`, `passkey`, `magicLink`, `bearer`) — module-level singleton, never wrapped in DI
- **Observability**: `pino` + `hono-pino`
- **Contract**: Hono RPC (`hc<AppType>`)
- **Primitives**: `@packages/ddd-kit` (`Result`, `Option`, `Entity`, `Aggregate`, `ValueObject`, `UUID`, `DomainEvent`, `BaseRepository`, `UseCase`)
- **Tooling**: pnpm 10 + Turborepo + Biome + Husky + commitlint + semantic-release + knip + jscpd
- **Testing**: `bun test` (api) + `vitest` (packages, app)

## Layout

```
apps/
  api/
    src/
      domain/                  Aggregates, Entities, Value Objects, Domain Events
      application/
        ports/                 Interfaces (repositories, services)
        use-cases/             One file per use case
        dto/                   Zod schemas (`<verb-noun>.dto.ts`, export `<Noun>Input = z.infer<...>`)
        event-handlers/        Side effects on domain events
      adapters/
        middleware/            Hono middleware (auth, error, logger, rate-limit)
        services/              External services (email, storage, …)
        repositories/          Drizzle repositories
        mappers/               Domain <-> DB
      routes/                  Hono route registration
      di/                      inwire container (flat; modules/ only when a context grows)
      auth.ts                  BetterAuth singleton
      client.ts                hcWithType (RPC client factory)
    common/                    env.ts, logger.ts
  app/
    src/
      main.tsx                 createRoot + <AppProviders />
      routes/                  TanStack Router file-based
        _protected.tsx         pathless gate — redirects when not authenticated
        _guest.tsx             pathless gate — redirects when already authenticated
      features/<area>/         workflow area (≈ application/)
        <feature>.page.tsx     entry component (`.page` suffix non-negotiable)
        <feature>.layout.tsx   (optional)
        <feature>.loading.tsx  (optional) → pendingComponent
        <feature>.error.tsx    (optional) → errorComponent
        _components/ _forms/ _hooks/ _schemas/   private colocated
      adapters/                api-client, auth-client, auth-broadcast, query-client, queries/, mutations/
      providers/               provider tree (≈ di/)
      common/                  zero-business infra (env, theme-toggle)
packages/
  ddd-kit                      DDD primitives
  drizzle                      DB client + TransactionService
  test                         shared vitest config
  typescript-config            tsconfig presets
  ui                           shadcn/ui components
```

## Architecture rules

1. **Domain has zero external imports** (only `@packages/ddd-kit` + `zod`).
2. **No `throw` in domain or application** — return `Result<T, E>`.
3. **No `null` / `undefined` for absence** — use `Option<T>`.
4. **Value Objects validate via zod** in `protected validate()`.
5. **Transactions managed in controllers**, passed to use cases.
6. **All dependencies injected via DI**. No service locators in use cases. Routes consume by name (`di.XxxUseCase.execute(...)`); never `new XxxUseCase(...)` at call site (bypasses container, breaks per-test impl swap).
7. **No barrel `index.ts` files** — import directly.
8. **Self-documenting code** — no inline comments unless WHY is non-obvious.
9. **Only `get id()` getter on aggregates**. Other props via `entity.get('propName')`.
10. **`className` is for layout only** — `flex` (default), `w-*`, `h-*`, `mx-auto`, `gap-*`, responsive breakpoints. **`grid` reserved for true 2D**; `flex flex-col gap-*` for any vertical stack. Colors / typography / radius / shadows / look-defining paddings live in **theme** (`packages/ui/src/styles/globals.css` `@theme`) or in the primitive itself. Inline `bg-foo text-bar p-3` = theme drift = no design system.
11. **Always shadcn first, stay shadcn-pure** — check `@packages/ui/components/ui/*` and the [shadcn registry](https://ui.shadcn.com/docs/components) before custom. **Use the actual slots** (`Card` + `CardHeader` + `CardTitle`) — wrong slot forces hacks (`pt-6`, `space-y-4`). No wrapper variants, no `data-slot="*"` overrides, no inline reshape. Adjustments → theme or primitive file. Custom (last resort) lives in `@packages/ui/components/ui/*`, never inline in a feature.
12. **Exactly one `<main>` per rendered page**. `__root.tsx` and pathless gates are passthroughs (`component: Outlet`) — never wrap in landmarks. Each `<feature>.page.tsx` owns its `<header>` / `<main>` / `<footer>`. Same for `<h1>` (one per page) — `TypographyH1` for hero, `TypographyH2` for sections.
13. **Zero warnings, zero errors before push**. Husky / lint-staged / commitlint / pre-push / CI must stay green (Biome, knip, jscpd, type-check). No `--no-verify`. Intentional warning → `/* biome-ignore <rule>: <why> */`. Contract: green `pnpm ci:check`.
14. **Reusability-first — promote, don't duplicate**. Second occurrence is the trigger. Theme-level (keyframes / utilities) or primitive-level (intrinsic to a component). Once promoted, call site has zero cosmetics. Same for logic: `mutationFn: (input) => api.x.$post({ json: input })` twice → extract a typed helper.
15. **Component props use `interface`, not `type`** — `interface <Component>Props { ... }` above each component (no inline `({ token }: { token: string })`). Reasons: declaration merging, IDE hover, consistency. `type` is for unions / intersections / mapped shapes / zod-inferred (`type X = z.infer<typeof xSchema>`).
16. **`void navigate(...)` in mutation callbacks, not `await`** — `await` keeps `isPending: true` during route transition (blocks submit). `void navigate(...)` resolves the mutation immediately and satisfies `no-floating-promises`. `await` only when chaining *after* navigation lands.
17. **Adding a rule to CLAUDE.md — omnipotent or it doesn't belong here.** A rule states a *principle* tied to an architectural property (Clean Architecture layer, type-safety boundary, design-system invariant, security posture). It must survive the swap of any specific library, version, or file path it currently references. Concrete examples are illustrations, never the rule itself — phrase library-agnostic when possible (object-storage provider, auth library, DI container) and only name a tool when it *is* the property (Zod = "validate at boundary"). **Promote on second occurrence** (rule 14): a one-off pain becomes a rule once a second case proves it generalizes. Always include the **why** (the failure mode the rule prevents) — without it, the rule rots on the first edge case. Add to the most specific section; promote to `## Architecture rules` only when the principle crosses sections. If the rule is inverse advice ("don't X"), mirror it in `## Don't` with the same wording. Delete or rewrite a rule the moment its underlying property changes — a stale rule is worse than no rule.

## CQRS

- **Commands** (writes): Controller → Use Case → Aggregate → Repository → EventDispatcher → Handlers
- **Queries** (reads): Controller → Query (direct ORM access, no use case)

## DI (inwire)

inwire's whole point is **type inference, no declarations**. The builder accumulates types as you `.add()`; `c` in every factory is fully typed against everything registered before. Reorder a call (use-case before its port) → `tsc` rejects. Order is enforced by inference.

**Default**: flat container with sections grouped by bounded context (`// uploads`, `// billing`). Promote a section to `apps/api/src/di/modules/<context>.module.ts` (`addModule` pattern, see `inwire/examples/04-modules.ts`) only when it grows ≥ 5 use-cases *and* container.ts becomes hard to scan.

**Rules**:

1. **No declared types until they pay for themselves.** No `interface XxxDeps`, no `<T extends { IPort: PortType }>` constraints, no central `types.ts`. Hand-declaring is exactly the boilerplate inwire removes.
2. **`AppDeps = typeof di`** after `.build()` — derived, never declared.
3. **Use-cases stay in `application/use-cases/`**, one file per use-case. DI is *wiring*; the use-case file is *implementation*.
4. **No barrel `index.ts`** in `di/`.

## Hono RPC (end-to-end type safety)

API exports its routes as `AppType` consumed by the app via `hono/client`. Routes **must be chained** to accumulate types — `app.use` and `app.onError` don't add to the typed schema.

**Two subpath exports from `apps/api/package.json`**:
- `.` → `./src/index.ts` (`AppType`, server runtime)
- `./client` → `./src/client.ts` (`hcWithType`, frontend pre-typed RPC client factory)

**Single client instance** in `apps/app/src/adapters/api-client.ts`: `hcWithType(baseUrl, { init: { credentials: "include" }, fetch: customFetch })`. The custom fetch injects `X-Request-Id` (correlates with API `requestId()`); also the slot for future global handlers (401 redirect, token refresh, Capacitor Bearer header).

**Non-negotiables**:

- **`hcWithType` from `api/client`, not inline `hc<AppType>` in the app** — `tsc` resolves `ApiClient` once, no per-callsite re-inference.
- **Trailing-slash normalize** the `baseUrl` — `hc` drops the last segment if missing.
- **`AbortSignal`** via per-call second arg → `await $get({}, { init: { signal } })`. TanStack Query passes `signal`; thread it.
- **Type sharing**: `InferRequestType<typeof $endpoint>["json"]` + `InferResponseType<typeof $endpoint, 200>` (status-narrowed to success).
- **Errors stay `throw on !res.ok`** — Hono `ApplyGlobalResponse` widens response types but doesn't give a discriminated union to `match` on. Don't fake SOTA.

Path segments mirror the URL (`/uploads/presign` → `api.uploads.presign`); method is `$post` / `$get`.

## App import direction

`routes/` → `features/` → `adapters/` → `common/`. `providers/` is bootstrap-only. No lateral cross-feature imports. No barrels.

| Folder | May import from | Must NOT import from |
|---|---|---|
| `routes/` | `features/`, `common/` | other features cross-link |
| `features/<x>/` | `adapters/`, `common/`, `@packages/*` | other `features/`, `routes/`, `providers/` |
| `adapters/` | `common/` | `features/`, `routes/`, `providers/` |
| `providers/` | `adapters/`, `common/`, `routeTree.gen.ts` | `features/` |
| `common/` | (nothing internal) | everything else |

## App feature anatomy

Symmetry with `apps/api`: `features/` ≈ `application/`, `adapters/` ≈ `adapters/`, `providers/` ≈ `di/`, `common/` ≈ `common/`. **No `domain/` on the front** — UI domain is never pure (React deps), so we don't fake it.

Naming: **Next.js App Router conventions** — `<name>.page.tsx`, `<name>.layout.tsx`, `_components/` / `_forms/` / `_hooks/` / `_schemas/` for private folders.

**Default to flatten**. Mono-page feature → `<feature>.page.tsx` directly under `features/<area>/`. Promote to `features/<area>/<feature>/` only when it grows multi-page.

**File naming**:
- Files: `kebab-case.tsx`. Components: `PascalCase` named exports.
- Hooks: `use-<verb>-<noun>.ts` → `useVerbNoun`.
- Schemas: `<noun>.schema.ts` → `<noun>Schema` + `<Noun>Input` (z.infer).
- Page entry: `<feature>.page.tsx` — route file is one line of wiring (`createFileRoute → component: <FeaturePage>`). The `.page` suffix disambiguates routes / pages / forms / cards.

**Rules**:

1. Page in `<feature>.page.tsx`. Components in `_components/` (flat — group only when ≥ 5 files share a concern).
2. Hooks **never** call `fetch` directly — go through `adapters/api-client.ts`.
3. Schemas are zod, with `z.infer` exporting the type next to the schema.
4. **Forms in `_forms/<action>-form.tsx`**, isolated from their host. Host (Card, Sheet, Dialog…) does layout only; the form owns RHF state, `zodResolver`, validation, submit. Pages stay composable, forms reusable across hosts.
5. Cross-feature reuse not pre-solved. When two features need the same `UserCard`: extract to `packages/ui` if presentational, or promote one feature to own it.

**Form contract**:

- `react-hook-form` + `zodResolver` + shadcn `Form` primitives.
- Always pass `defaultValues` to `useForm` (no flash of uncontrolled).
- Submit via `form.handleSubmit((values) => mutation.mutate(values))` — never manual `(e) => …`.
- Form imports its hook (`../_hooks/use-<action>`) and schema (`../_schemas/<thing>.schema`). Never `fetch` directly.

**Schema contract — split loose vs strict for the same field shape.** A field *captured* in one flow (sign-in: transmit, server validates) and *created* in another (sign-up / reset: enforce strength) needs two schemas. Validating strength on sign-in locks out users with old passwords who need to log in to *change* them. Composition rules stay minimal — NIST SP 800-63B 2024 deprecates required special chars; for stronger guarantees swap to `zxcvbn-ts`.

**Typography contract**:

- All text uses shadcn typography exports (`@packages/ui/components/ui/typography`). Named exports, not a namespace.
- Never raw `<h1 className="text-5xl font-bold">` or `<p className="text-muted-foreground text-sm">`. Custom typography → theme or the Typography component itself (rule 10).
- `className` on Typography reserved for **layout** (`mx-auto max-w-2xl text-balance`). Never override colors / weights / fonts.

**Theme & dark mode**: `next-themes` provider in `app-providers.tsx` (`attribute="class"`, `defaultTheme="system"`, `disableTransitionOnChange`). Toggle uses View Transitions API with `prefers-reduced-motion` fallback. View-transition CSS lives in `globals.css` (theme-level).

**Queries / mutations / hooks — three forms, one decision tree.**

Options factories (`queryOptions` / `mutationOptions`) compose better than hook wrappers: typed, prefetchable in `beforeLoad`, call site overrides `onSuccess` / `onError` / `staleTime` / `select` per-use. Hook wrappers earn their keep only when the workflow itself owns side-effects that *always* fire and aren't the call site's concern.

| Case | Where | Form |
|---|---|---|
| **Query** (any read) | `adapters/queries/<noun>.ts` | `xxxQueryOptions` via `queryOptions(...)`. Consumed via `useQuery(xxxQueryOptions)` and `queryClient.ensureQueryData(xxxQueryOptions)` in `beforeLoad`. |
| **Mutation, cross-feature or multi-step** | `adapters/mutations/<verb>.ts` | `xxxMutationOptions` via `mutationOptions(...)`. Consumed via `useMutation(xxxMutationOptions)`. **Call site owns side-effects.** |
| **Mutation feature-specific with bundled side-effects** (toast + navigate + invalidate + broadcast) | `features/<x>/_hooks/use-<verb>.ts` | Hook wrapping `useMutation`. The hook owns `onSuccess` / `onError`. Used by exactly one feature. |
| **Pure React utility** (no API, no workflow) | `features/<x>/_hooks/` if scoped, `adapters/` if generic | Plain hook. |

**Rule**: a hook that does only `return useMutation({ mutationFn })` is an indirection — promote to a `mutationOptions` factory.

**Cross-feature resource hooks**: extract to `adapters/queries/` only when 2+ features need the same `useUser` / `useCart`. Don't pre-emptively place them there.

### `mutationOptions` cookbook

**Where**: `adapters/mutations/<verb-noun>.ts`. File mirrors the backend use-case (`create-upload-url.use-case.ts` ↔ `mutations/create-upload.ts`). Export = `<verbNoun>MutationOptions`. Never prefix with `use-` — these are objects, not hooks.

**Rules**:

1. **Side-effects belong to the call site, not the factory.** No `toast` / `navigate` / `invalidateQueries` inside `mutationOptions`. The factory does **only** the network work — different call sites have different success messages and post-success destinations.
2. **Spread, don't override.** `useMutation({ ...createXMutationOptions, onSuccess: … })`. Never mutate the exported object.
3. **`mutationKey`** is `[<resource>, <verb>]` (e.g. `["uploads", "create"]`). Lets `useIsMutating({ mutationKey })` find in-flight mutations.
4. **Types via `InferRequestType` / `InferResponseType<…, 200>`**, paired with `if (!res.ok) throw` so the function signature stays accurate.
5. **Multi-step workflows go in the factory** (presign → PUT → confirm). The factory presents a single `mutationFn` returning server-verified output. Call site never reasons about intermediate steps.
6. **Hook only when side-effects are truly bundled** (sign-in: toast + refetch session + broadcast + navigate, every call). If side-effects vary per call site, factory + per-call override is the better fit.
7. **`AbortSignal`**: single-API-call factories thread it via `init.signal`. Multi-step flows with cleanup typically can't honour cancellation cleanly — document this if so.

**Composition patterns**:

- **Cards**: use the slots — `Card` + `CardHeader` + `CardTitle` + `CardContent` (+ optional `CardDescription`, `CardFooter`). Primitive provides `py-6` / `gap-6`; never re-add `pt-6` / `space-y-4` to compensate for a skipped slot.
- **Numbered / iconic markers**: `Badge variant="secondary"` with layout (`size-6`, `font-mono`). Don't hand-roll `<span className="rounded-full bg-secondary …">`.
- **Styled links / nav items**: primitive owns *style*, router owns *navigation*. Compose via `asChild` (`<NavLink asChild><Link to="/x">...</Link></NavLink>`). Same for `<Button asChild><Link …/></Button>`.
- **List bullets**: lucide icons (`<Dot />`, `<Check />`) over custom `<span>`s. Sized via `size-*`, colored via theme tokens.

**Rule of thumb**: raw `<a className="text-…">`, `<span className="… rounded-full bg-…">`, `<div className="… rounded-lg border bg-…">` in a feature = skipped slot or duplicated primitive — promote, don't patch (rule 14).

## Route gates (pathless layouts)

Auth state is enforced by **pathless layouts**, not per-route `beforeLoad` duplication.

```
routes/
  __root.tsx                  passthrough (component: Outlet)
  _protected.tsx              redirects to /sign-in if no session
  _protected/dashboard.tsx    URL: /dashboard (inherits the gate)
  _guest.tsx                  redirects to /dashboard if session exists
  _guest/sign-in.tsx          URL: /sign-in
```

The `_` prefix tells TanStack Router this segment is not part of the URL — it hosts a shared `beforeLoad`.

**Naming**: by access *condition*, not feature. `_protected` = "must be authenticated", `_guest` = "must NOT". Avoid `_auth` (ambiguous: routes *about* auth vs routes *requiring* auth).

**Single source of session truth — TanStack Query, not React state.** Router context only exposes `queryClient`. Each gate's `beforeLoad` reads via `await context.queryClient.ensureQueryData(sessionQueryOptions)` (`adapters/queries/session.ts`, staleTime aligned with auth `cookieCache.maxAge`). No `useSession()` React bridge, no race between auth-lib stores and `beforeLoad`.

**After auth mutations, push state into the query, then navigate.** Sign-in / verify-email / magic-link / 2FA-verify do `await queryClient.refetchQueries({ queryKey: sessionQueryOptions.queryKey })` (cookie is set; refetch pulls canonical shape). Sign-out does `setQueryData(..., null)` (result is known). Then `void navigate({ to: ... })`.

**Token-consuming pages stay outside the gates** — `/verify-email`, `/reset-password`, `/magic-link`, `/two-factor`. Putting them under `_guest` would 302 them away the moment the consumed token signs the user in. They handle their own state. Token-consume effects use a `useRef(false)` guard against React StrictMode double-fire (single-use tokens would otherwise be invalidated by the second invocation in dev).

**Realtime cross-tab sync via `BroadcastChannel`** — `adapters/auth-broadcast.ts` (~15 LoC, native web API, stable since 2017). Auth mutations call `broadcastAuthChange()`; `app-providers.tsx` listens once and on receive does `refetchQueries(['session'])` + `router.invalidate()`. Tab A signs out → tab B (idle on `/dashboard`) instantly transitions to `/sign-in`. Signal carries no payload — cookie is shared, each tab refetches against live server state. **Use this for any auth state change** (sign-in, sign-out, verify-*, 2FA, future org switch / role change / impersonation).

## Auth (BetterAuth integration)

BetterAuth ships as a **module-level singleton** (`apps/api/src/auth.ts`). Not wrapped in a port/adapter, not registered in DI — wrapping would only recopy `auth.api.*` and lose the strong typing of `auth.$Infer.*`. Every consumer imports `auth` directly.

**Server pipeline** (in order, in `index.ts`):

1. `requestId()` — seeds `c.var.requestId` for log correlation.
2. `httpLogger` (hono-pino).
3. `secureHeaders()`, `cors({ origin: env.CORS_ORIGIN, credentials: true })`.
4. `sessionMiddleware` — calls `auth.api.getSession()` once per request, stores `user` / `session` on context. Skips `/api/auth/*`.
5. Mount `app.on(["GET", "POST"], "/api/auth/*", (c) => auth.handler(c.req.raw))`.
6. `app.onError(errorHandler)`.

Protected handlers compose `requireAuth` — reads the resolved session and throws `HTTPException(401)` if absent. **Never re-call `auth.api.getSession()` per handler.**

**Client** (`adapters/auth-client.ts`): one `createAuthClient` with the same plugin set as the server. Consumers import `authClient` directly — no re-exports. Session reads go through TanStack Query, not the auth-lib nanostore.

**Non-negotiable defaults**:

- **`session.cookieCache: { enabled: true, maxAge: 5 * 60 }`** — auth check is signature-only between refreshes (no DB hit). DB is source of truth at expiry → instant revoke. Keep `maxAge` ≤ 15 min.
- **`bearer()` plugin** — alongside cookies. Web stays cookie-based (httpOnly, XSS-safe); Capacitor / mobile uses bearer with secure storage. Same session row in DB — only transport differs.
- **Cookies**: `httpOnly: true`, `sameSite: "lax"`, `secure: isProd` in `auth.advanced.defaultCookieAttributes`.

**Email URLs route through the app, not the API.** Every email link points to `${env.APP_URL}/<route>?token=...`; the frontend route consumes the token via the typed client. Reasons: branded UX (loading / error / redirect); avoids Outlook/Gmail re-autolinking visible URL text and mangling `?callbackURL=...`. Use a short label like "Verify your email", never the full URL. Apply to all auth-token emails (org invitations, etc.).

## Logging & error handling

**No `console.*` in production paths.** All logs go through `pino` (`apps/api/common/logger.ts`): JSON to stdout in prod, `pino-pretty` single-line in dev. Level: `info` prod, `debug` dev.

**HTTP logger**: `hono-pino` with `referRequestIdKey: "requestId"` — every line carries the same request id as the response payload. Status-driven: `5xx → error`, `4xx → warn`, `2xx/3xx → info`.

**Error handler**: one `app.onError(errorHandler)`, no per-route `try/catch` for HTTP wrapping.

- `HTTPException` → `{ error: { code: "HTTP_<status>", message, requestId } }`. Logged at `error` only when `status >= 500`.
- Anything else → `500` `{ error: { code: "INTERNAL_ERROR", message: "Internal Server Error", requestId, stack? } }`. Stack only outside production.

**Throwing the right exception is the API.** Domain & application use `Result<T, E>` (no throw). At the controller boundary, translate failures to `HTTPException(<status>, { message })`. Never invent a custom error envelope per route — the envelope above is the contract for the whole API.

## Storage (object-storage-agnostic, S3-compatible)

**Server is blind during the upload.** Client `PUT`s **directly** to the storage provider using the presigned URL — API only sees `presign` (issue URL) and `confirm` (verify after). Three-step flow:

1. **`POST /uploads/presign`** — auth + Zod (`filename`, `contentType`, `size`, `scope`, `expiresInSeconds?`). Use-case clamps TTL, generates the **owner-scoped key** `<userId>/<scope>/<uuid>-<filename>`, calls `IStorageService.presignUpload`. Adapter signs `content-type` + `content-length` (`signableHeaders`) — different headers fail with 403 `SignatureDoesNotMatch`. Response includes `expectedSize` + `expectedContentType` (echo, used by `confirm`).
2. **Client `PUT <signed_url>`** — direct to provider, exact `Content-Type` + `Content-Length` headers, file body. Zero proxy through the API. The PUT explicitly sends `Content-Length: String(file.size)` to match the server-signed header (browsers inject anyway, but stating it is the documented contract).
3. **`POST /uploads/confirm`** — auth + Zod (`key`, `expectedSize`, `expectedContentType`). Use-case enforces **owner check** (`key.startsWith("<userId>/")` → 403 `STORAGE_FORBIDDEN`), then `HeadObject` reads real `size`/`contentType`. **Size is permissive** (only fails if `actual > expected` — undershooting OK, e.g. client-side compression). **Content-type is strict**. On mismatch: `DeleteObject` + 422 `STORAGE_INTEGRITY_FAILED` (delete failure → `STORAGE_PROVIDER_FAILURE`, never silently swallowed). On success: returns `{ key, size, contentType, publicUrl }` — the only metadata the rest of the app should trust.

**Why three steps**: providers like R2 don't support Presigned POST policies (no `content-length-range`, verified 2026). Signed `ContentLength` blocks naïve clients but providers don't verify the body size against it — `confirm` is the real enforcement. Same for content-type.

**Download** (`POST /uploads/download`) — symmetric: auth + Zod, use-case runs the same owner check, presigns a `GetObjectCommand`.

**Section-specific rules**:

1. **Port = pure transport.** `IStorageService` exposes only SDK-level operations (`presignUpload`, `presignDownload`, `headObject`, `deleteObject`, `publicUrlFor`). Zero business rules in the adapter.
2. **Use-cases = orchestration only.** Key generation, owner check, TTL clamping, integrity verification. No `throw` — return `Result<T, StorageError>`.
3. **Validation lives in `application/dto/*.dto.ts`** (filename regex, scope regex, size cap `STORAGE_MAX_UPLOAD_BYTES`, max TTL), consumed by routes via `zValidator("json", schema)`. Zod failures become 400 via the centralised handler. Use-cases trust their input.
4. **Routes = thin controllers.** Resolve from DI (`di.CreateUploadUrlUseCase` etc.), `await execute(...)`, map `Result` → HTTP via central `statusFor(error)` switch. Mapping: 403 `STORAGE_FORBIDDEN`, 404 `STORAGE_NOT_FOUND`, 422 `STORAGE_INTEGRITY_FAILED`, 502 `STORAGE_PROVIDER_FAILURE`. `requireAuth` narrows `c.get("user")` to non-null `SessionUser` — no manual null guard.
5. **Provider-agnostic via S3 SDK config**: `region: "auto"` (R2), `forcePathStyle: true` (harmless on R2, required for MinIO). Boot-time fail-hard if `NODE_ENV === "production"` and `S3_ENDPOINT` is localhost or creds are default `minioadmin`. Once a provider region/jurisdiction is chosen (e.g. R2 EU), buckets typically can't be moved.
6. **Multi-step factory chain.** `createUploadMutationOptions` resolves only after `confirm` succeeds. UI consumes via `useMutation({ ...createUploadMutationOptions, onSuccess, onError })` — receives server-verified metadata or explicit error, never a "maybe uploaded" intermediate state.

**Phase 2 (deferred until first concrete consumer)**:
- **Orphan GC**: client crash between `PUT` and `confirm` leaves an unreferenced object. Add a worker (cron) deleting objects older than X minutes with no DB row referencing the key. Requires the first business table that stores keys.
- **Integration event bus**: when 2+ handlers need to react to `UploadConfirmedEvent`, promote an `IAppEventBus` port (distinct from domain events — those stay reserved for aggregates). Current single-consumer is a direct call by design (rule 14).

## Domain Events

Events are *added* in aggregate methods (`this.addEvent(...)`), NOT dispatched there. Dispatch in use cases AFTER successful persistence:

```typescript
const saveResult = await this.repo.create(aggregate);
if (saveResult.isFailure) return Result.fail(saveResult.getError());
await this.eventDispatcher.dispatchAll(aggregate.domainEvents);
aggregate.clearEvents();
```

## Testing

BDD style. One test file per use case under `__TESTS__/`. Mock at the repository/port level. Test `Result` / `Option` state transitions.

## Common patterns

```typescript
// Result
Result.ok(value); Result.fail(error); Result.combine([r1, r2, r3]);

// Option
Option.some(value); Option.none(); Option.fromNullable(value);

// Aggregate
class Foo extends Aggregate<IFooProps> {
  get id(): FooId { return FooId.create(this._id); }
  static create(props): Foo {
    const e = new Foo({ ...props, createdAt: new Date() }, new UUID());
    e.addEvent(new FooCreatedEvent(e));
    return e;
  }
}

// Value Object
class Email extends ValueObject<string> {
  protected validate(v: string): Result<string> {
    return v.includes("@") ? Result.ok(v) : Result.fail("Invalid email");
  }
}
```

## Turborepo

- `ui: "tui"` in `turbo.json` — daemon auto-managed since v2.x.
- `globalDependencies`: `biome.json`, `pnpm-workspace.yaml`, `.env*` — modifying these busts every cache.
- `inputs` scoped per task — README/doc edits do NOT invalidate code caches.
- `build` declares `with: ["type-check"]` — `pnpm build` runs type-check in parallel for free.
- `dev`, `test:watch`, `db:studio` are `interruptible: true` — clean ctrl+C on next reload.

## Useful scripts

- `pnpm dev` — Turbo TUI dev (`pnpm dev --filter=api` to filter)
- `pnpm build` / `test` / `type-check` — Turbo orchestrated
- `pnpm check` (Biome lint+format) / `fix` / `ci:check` (CI lint)
- `pnpm check:duplication` (jscpd) / `check:unused` (knip)
- `pnpm db:push` / `db:generate` / `db:migrate` / `db:seed` / `db:studio`
- `pnpm clean` — wipe `node_modules`, `.turbo`, `dist`

## DB

- `docker compose up -d` from repo root — Postgres on `localhost:5433`.
- Schema in `packages/drizzle/src/schema/*.ts`.
- After schema change: `pnpm db:push` (dev) or `pnpm db:generate && pnpm db:migrate` (prod-style).

## Release flow

Two-branch model. **`main` is the released branch — every merge to `main` triggers semantic-release.** `dev` is the integration branch.

- **Conventional Commits required** (commitlint enforces lower-case subject). Release impact per type (`.releaserc.json`): `feat` → minor, `fix`/`perf`/`refactor`/`revert`/`build` → patch, `docs(readme)` → patch, everything else (`docs`, `style`, `test`, `chore`, `ci`) → no release. `BREAKING CHANGE:` footer (or `!` after type) → major. Pick the type for the *release impact you want*, not the file touched (e.g. shipping a user-visible feature = `feat`, even if the diff is mostly refactor).
- Daily work happens on `dev` (or feature branches PR'd into `dev`). Pushing to `dev` does **not** trigger a release.
- Shipping is deliberate: open a PR `dev` → `main`, merge it. semantic-release analyzes **all** commits since the last tag → one bundled bump + changelog.
- **`dev` → `main` MUST be a merge commit** (not squash, not rebase). Squash collapses every conventional commit into one — semantic-release would only see one entry. GitHub-side configured to allow merge commits only.
- `main` is protected (require PR, no force push, conversation resolution required). CI fix during release → do it on `dev` and re-merge.
- **Don't release on every commit** — wait for a meaningful batch. Cadence is controlled by *when you merge to main*.

## Don't

- Add business features without first agreeing on the bounded context.
- Throw in domain or application; use `null` for absence; add `index.ts` barrels; add inline comments that restate what the code does.
- Reintroduce `@hono/node-server`, `tsx`, `tsc-alias` — the API runs on Bun natively.
- Pin Postgres back to port 5432 — collides with other local Postgres instances.
- Break Hono RPC by un-chaining routes (`app.get(...); app.post(...)`) — types accumulate via chaining.
- Call `fetch` directly in features — use `api` from `adapters/api-client.ts`.
- Wrap the auth library in a port/service or register it in DI — `auth` is the integration. Import directly.
- Re-call `auth.api.getSession()` per route handler — `sessionMiddleware` reads it once; `requireAuth` / `c.get("user")` does the rest.
- Embed the API verification URL in an email — every link points to `${env.APP_URL}/<route>?token=...`. Use a short label, never the full URL.
- Sprinkle `console.log` / `console.error` — go through `pino` and the centralised handler.
- Duplicate `beforeLoad` auth checks per route — host them on a pathless layout.
- Push directly to `main` or merge `dev` → `main` with squash/rebase — destroys conventional-commit history.
- Put session data in `router.context` or sync via `useSession()` React boundary — race between auth-lib stores and `beforeLoad`. Read via `ensureQueryData(sessionQueryOptions)`; context only exposes `queryClient`.
- `await navigate(...)` in `useMutation.onSuccess` — keeps mutation pending during transition. Use `void navigate(...)`.
- Mutate session-changing flows without calling `broadcastAuthChange()` — other tabs stay stuck on stale data.
- Validate password strength on the **sign-in** form — only on sign-up / reset. Legacy weak passwords must still log in to *change*.
- Type component props with `type` — use `interface <Component>Props { ... }`.
- Consume a single-use token from `useEffect` without a `useRef(false)` guard — StrictMode double-fire invalidates the token.
- Pass `redirectTo` / `callbackURL` to auth-client methods when the corresponding `send*` server hook already builds the URL — duplicate dead code that can silently override the canonical URL.
- Wrap a one-liner mutation in a custom hook — promote to a `mutationOptions` factory in `adapters/`. Hook wrappers earn their keep only when bundling side-effects.
- Trust the size or content-type a client declares at `presign` time without running `confirm` — server is blind during upload. Skipping `confirm` = trusting the client.
- Skip the owner-prefix check (`key.startsWith("<userId>/")`) in download/confirm use-cases — without it any authenticated user can presign a GET / verify any key in the bucket.
- Stuff business rules into `IStorageService` (validation, key shape, ACLs) — port stays pure transport. Rules belong in the use-case or the route's Zod schema.
- Add a Presigned POST flow to upload — providers like R2 don't implement POST policies (verified 2026). PUT presigned + `confirm` is the correct shape.
