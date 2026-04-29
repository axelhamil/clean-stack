# CLAUDE.md

Generic monorepo boilerplate. Clean Architecture + DDD. No business features.

## Philosophy

Lean Startup — **Build → Measure → Learn**. The bottleneck is *Build*, so this stack ships the SaaS plumbing (auth, billing, multi-tenant, email, storage) and isolates the domain so pivots don't trash the foundation. Default move when in doubt: ship the smallest thing that tests one hypothesis. "Done > perfect" applies to features; the architecture rules below stay non-negotiable because they're what *makes* shipping fast sustainable.

## Working method

**Whenever something is unclear about a library API, version, config option, or "is this still SOTA" — check the docs before guessing.**

1. **Primary**: Context7 MCP via the `explore-docs` agent (Hono, TanStack Router/Query, Drizzle, Zod, shadcn, sonner, next-themes, react-hook-form, Vite, Bun…).
2. **Fallback**: web search via the `websearch` agent / `WebFetch` for libs Context7 doesn't index, or for broader questions (architecture posts, RFCs).
3. **Never** invent API surface from memory when it's a 30s lookup. Outdated patterns (deprecated hooks, removed flags) are a frequent failure mode.

## Stack

- **Runtime**: Bun 1.3+ (api + scripts), Node 24.15+ for tooling
- **API**: Hono on native `Bun.serve()` — `bun build` (prod, ~7ms), `bun --hot` (dev)
- **App**: Vite 8 + React 19 + TanStack Router + TanStack Query + Tailwind 4 (`@tailwindcss/vite`)
- **UI kit**: shadcn/ui (`@packages/ui`) + `sonner` (toasts) + `next-themes` (light/dark/system)
- **DB**: Drizzle ORM + Postgres 17 (Docker, port `5433` to avoid local Postgres collisions)
- **DI**: `inwire`
- **Auth**: BetterAuth (Drizzle adapter + `twoFactor`, `passkey`, `magicLink`, `bearer`) — module-level singleton in `apps/api/src/auth.ts`, never wrapped in DI
- **Observability**: `pino` (root, JSON in prod, `pino-pretty` in dev) + `hono-pino` (per-request, status-driven level)
- **API ↔ App contract**: Hono RPC (`hc<AppType>`) — type-safe routes end-to-end
- **Primitives**: `@packages/ddd-kit` (`Result<T,E>`, `Option<T>`, `Entity`, `Aggregate`, `ValueObject`, `UUID`, `DomainEvent`, `BaseRepository`, `UseCase`)
- **Packages tooling**: `tsup` (esbuild) for `ddd-kit` + `drizzle`
- **Repo tooling**: pnpm 10 + Turborepo + Biome + Husky + commitlint + semantic-release + knip + jscpd
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
        dto/                   Zod schemas
        event-handlers/        Side effects on domain events
      adapters/
        middleware/            Hono middleware (auth, error, logger, rate-limit)
        services/              External services (email, storage, …)
        repositories/          Drizzle repositories
        mappers/               Domain <-> DB
      routes/                  Hono route registration
      di/                      inwire container (flat by default; modules/ only when a context grows large)
      auth.ts                  BetterAuth singleton
    common/
      env.ts                   Validated env (zod)
      logger.ts                pino root logger
  app/
    src/
      main.tsx                 createRoot + <AppProviders />
      routes/                  TanStack Router file-based routes
        _protected.tsx         pathless gate — redirects when not authenticated
        _guest.tsx             pathless gate — redirects when already authenticated
      features/<area>/         workflow area (auth, dashboard, …) (≈ application/)
        <feature>.page.tsx     entry component (`.page` suffix is non-negotiable)
        <feature>.layout.tsx   (optional)
        <feature>.loading.tsx  (optional) → route's pendingComponent
        <feature>.error.tsx    (optional) → route's errorComponent
        _components/           private colocated components
        _forms/                private isolated forms (RHF + zodResolver)
        _hooks/                private feature-local React hooks
        _schemas/              private zod schemas
      adapters/                auth-client, auth-broadcast, query-client, queries/session, storage
      providers/               provider tree (≈ di/)
      common/                  zero-business infra (env.ts, components/theme-toggle.tsx)
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
6. **All dependencies injected** via inwire DI. No service locators in use cases.
7. **No barrel `index.ts` files** — import directly.
8. **Self-documenting code** — no inline comments unless the WHY is non-obvious.
9. **Only `get id()` getter on aggregates**. Other props via `entity.get('propName')`.
10. **`className` is for layout only** — `flex` (default), `w-*`, `h-*`, `mx-auto`, `gap-*`, responsive breakpoints. **`grid` is reserved for true 2D layouts**; `flex flex-col gap-*` for any vertical stack. Colors / typography / radius / shadows / look-defining paddings live in the **theme** (`packages/ui/src/styles/globals.css` `@theme`) or in the shadcn primitive itself (`packages/ui/src/components/ui/*`). Inline overrides like `bg-foo text-bar p-3` = theme drift = no design system.
11. **Always shadcn first, stay shadcn-pure** — check `@packages/ui/components/ui/*` and the [shadcn registry](https://ui.shadcn.com/docs/components) before custom. **Use the actual slots** — `Card` + `CardHeader` + `CardTitle`, never `<TypographyP className="font-medium">` shoved into `CardContent` (the wrong slot forces hacks like `pt-6`, `space-y-4`). No wrapper variants, no `data-slot="*"` overrides, no inline re-shaping. Adjustments live in the theme or in the primitive file. When you do go custom (last resort), put it in `@packages/ui/components/ui/*`, never inline in a feature.
12. **Exactly one `<main>` per rendered page**. `routes/__root.tsx` and pathless gates (`_protected.tsx`, `_guest.tsx`) are passthroughs (`component: Outlet` / `component: () => <Outlet />`) — never wrap in landmarks. Each `<feature>.page.tsx` owns its own `<header>` / `<main>` / `<footer>`. Same rule for `<h1>` (one per page) — `TypographyH1` for the hero, `TypographyH2` for sections.
13. **Zero warnings, zero errors before push**. Husky / lint-staged / commitlint / pre-push / CI must stay green — Biome, knip, jscpd, type-check, all of it. No `--no-verify`. If a warning is genuinely intentional, silence it locally with `/* biome-ignore <rule>: <why> */`. Contract: green `pnpm ci:check`.
14. **Reusability-first — promote, don't duplicate**. Second occurrence of any pattern (animation, hover, layout, mutation shape) is the trigger. Two destinations: theme-level (`globals.css` for keyframes / utilities) or primitive-level (`packages/ui/components/ui/*` when intrinsic to a component). Once promoted, the call site contains zero cosmetics — only layout per rule 10. Same for logic: if `mutationFn: (input) => api.x.$post({ json: input })` shows up twice, extract a typed helper. Three duplications become twelve before you notice.
15. **Component props use `interface`, not `type`** — `interface <Component>Props { ... }` above each component, including sub-components in the same file (no inline `({ token }: { token: string })`). Reasons: declaration merging, better IDE hover, codebase consistency. `type` is for unions / intersections / mapped shapes / zod-inferred types (`type SignInInput = z.infer<typeof signInSchema>`).
16. **`void navigate(...)` in mutation callbacks, not `await`** — `await navigate()` in `useMutation.onSuccess` keeps `isPending: true` during the route transition (beforeLoad + view-transitions + animations), blocking the submit button. `void navigate(...)` is the fire-and-forget that satisfies `no-floating-promises` and resolves the mutation immediately. `await` only when chaining something *after* the navigation lands.

## CQRS

- **Commands** (writes): Controller → Use Case → Aggregate → Repository → EventDispatcher → Handlers
- **Queries** (reads): Controller → Query (direct ORM access, no use case layer)

## DI (inwire)

inwire's whole point is **type inference, no declarations**. The builder accumulates types as you `.add()`; `c` in every factory is fully typed against everything registered before. There is no `AppDeps` interface to maintain — `AppDeps = typeof di` is derived after `.build()`.

**Default: flat container with sections** in `apps/api/src/di/container.ts`. Group `add()` calls by bounded context with line comments. Promote to a separate module file only when a bounded context grows large (≥ 5 use-cases of the same domain) and would noticeably bloat `container.ts`:

```typescript
// apps/api/src/di/container.ts
import { container } from "inwire";
import { ResendEmailService } from "../adapters/services/email.service";
import { S3StorageService } from "../adapters/services/storage.service";
import { CreateUploadUrlUseCase } from "../application/use-cases/create-upload-url.use-case";
import { ConfirmUploadUseCase } from "../application/use-cases/confirm-upload.use-case";
import { CreateDownloadUrlUseCase } from "../application/use-cases/create-download-url.use-case";

export const di = container()
  // infra
  .add("IEmailService", () => new ResendEmailService())
  .add("IStorageService", () => new S3StorageService())
  // uploads
  .add("CreateUploadUrlUseCase", (c) => new CreateUploadUrlUseCase(c.IStorageService))
  .add("ConfirmUploadUseCase", (c) => new ConfirmUploadUseCase(c.IStorageService))
  .add("CreateDownloadUrlUseCase", (c) => new CreateDownloadUrlUseCase(c.IStorageService))
  .build();

export type AppDeps = typeof di;
```

Reorder a call — put a use-case before the port it depends on — and `tsc` rejects: `c.IStorageService` is unknown until the port is registered. Order is enforced by inference, not by hand-declared constraints.

**Rules**:

1. **No declared types until they pay for themselves.** Don't write `interface XxxDeps`, don't write `<T extends { IPort: PortType }>` constraints, don't maintain a central `types.ts`. inwire infers it all. Hand-declaring those types is exactly the boilerplate inwire was built to remove.
2. **`AppDeps = typeof di`** after `.build()` — derived, never declared.
3. **Sections by bounded context with line comments** (`// uploads`, `// billing`, `// auth`). When a section reaches ≥ 5 use-cases *and* container.ts becomes hard to scan, extract that section to `apps/api/src/di/modules/<context>.module.ts` using the `addModule` pattern from inwire (see `inwire/examples/04-modules.ts`). At that point, the type constraint on the module *is* the right form — but only because the bounded context has earned its own file.
4. **Use-cases stay in `application/use-cases/`**, one file per use-case. The DI is *wiring*; the use-case file is the *implementation*.
5. **Routes consume use-cases by name** (`di.CreateUploadUrlUseCase.execute(...)`). Never `new CreateUploadUrlUseCase(...)` at the call site — bypasses the container and breaks per-test impl swapping via `di.module(...)`.
6. **No barrel `index.ts`** in `di/`.

## Hono RPC (end-to-end type safety)

The api exports its routes as a type (`AppType`) consumed by the app via `hono/client`. Routes **must be chained** to accumulate types — `app.use` and `app.onError` don't add to the typed schema.

**Two subpath exports from the api package**:

```jsonc
// apps/api/package.json
"exports": {
  ".": "./src/index.ts",        // AppType (server runtime imports too)
  "./client": "./src/client.ts" // hcWithType (frontend only — pre-typed RPC client)
}
```

```typescript
// apps/api/src/index.ts
const routes = app
  .get("/health", (c) => c.json({ status: "ok" as const }))
  .post(
    "/widgets",
    zValidator("json", z.object({ name: z.string() })),
    (c) => c.json({ ok: true as const, name: c.req.valid("json").name }),
  );
export type AppType = typeof routes;

// apps/api/src/client.ts — pre-computed RPC client type
import { hc } from "hono/client";
import type { AppType } from "./index";
export type ApiClient = ReturnType<typeof hc<AppType>>;
export const hcWithType = (
  ...args: Parameters<typeof hc<AppType>>
): ApiClient => hc<AppType>(...args);
```

```typescript
// apps/app/src/adapters/api-client.ts — single instance, custom fetch interceptor
import { hcWithType } from "api/client";
import { env } from "../common/env";

const baseUrl = env.VITE_API_URL.endsWith("/")
  ? env.VITE_API_URL
  : `${env.VITE_API_URL}/`;

type FetchFn = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

const customFetch: FetchFn = async (input, init) => {
  const headers = new Headers(init?.headers);
  if (!headers.has("X-Request-Id")) {
    headers.set("X-Request-Id", crypto.randomUUID());
  }
  return fetch(input, { ...init, headers });
};

export const api = hcWithType(baseUrl, {
  init: { credentials: "include" },
  fetch: customFetch,
});
```

```typescript
// Mutation factory — adapters/mutations/<verb>.ts
import { mutationOptions } from "@tanstack/react-query";
import type { InferRequestType, InferResponseType } from "hono/client";
import { api } from "../api-client";

const $post = api.widgets.$post;
type Body = InferRequestType<typeof $post>["json"];
type Response = InferResponseType<typeof $post, 200>; // status-narrowed

export const createWidgetMutationOptions = mutationOptions({
  mutationKey: ["widgets", "create"] as const,
  mutationFn: async (input: Body): Promise<Response> => {
    const res = await $post({ json: input });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  },
});
```

**Non-negotiables**:

- **`hcWithType` exported from `api/client`, not inline `hc<AppType>` in the app** — eliminates per-callsite generic re-inference. `tsc` resolves `ApiClient` once.
- **Trailing-slash normalize** the `baseUrl` — `hc` drops the last segment of the base when the slash is missing.
- **Single client instance** with a custom `fetch` — adds `X-Request-Id` per request (correlates with the api `requestId()` middleware), and is the natural slot for future global handlers (401 redirect, token refresh) and for the Capacitor branch (Bearer header from secure storage).
- **`AbortSignal`**: pass via the per-call second arg → `await $get({}, { init: { signal } })`. TanStack Query's `queryFn`/`mutationFn` receive `signal`; thread it through.
- **`InferRequestType` / `InferResponseType<typeof $endpoint, 200>`** for sharing request/response shapes — status-narrowed (`200`) so the type is the success-only payload.
- **Errors stay throw-on-`!res.ok`** — Hono 2026 ships `ApplyGlobalResponse` to widen `InferResponseType` with error shapes, but it does not give a discriminated union you can exhaustively `match`. Don't fake a SOTA you'll regret.

The `api` workspace dep is wired via `apps/api/package.json` `exports`. The app consumes types only — server runtime never bundled. Path segments mirror the URL (`/widgets` → `api.widgets`); method is `$post` / `$get` / etc.

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

Symmetry with `apps/api`: `features/` ≈ `application/`, `adapters/` ≈ `adapters/`, `providers/` ≈ `di/`, `common/` ≈ `common/`. Intentionally **no `domain/` on the front** — UI domain is never pure (React deps), so we don't fake it.

Naming follows **Next.js App Router conventions** — suffix-based files (`<name>.page.tsx`, `<name>.layout.tsx`), `_components/` / `_forms/` / `_hooks/` / `_schemas/` for private folders.

**Default to flatten.** When a feature is mono-page, keep `<feature>.page.tsx` directly under `features/<area>/` rather than a `<feature>/` folder for one file. Promote to `features/<area>/<feature>/` only when it actually grows multi-page (e.g. an onboarding wizard).

**File naming:**

- Files: `kebab-case.tsx`. Components export `PascalCase` named (`export function <Feature>Page`).
- Hooks: `use-<verb>-<noun>.ts`, exporting `useVerbNoun`.
- Schemas: `<noun>.schema.ts`, exporting `<noun>Schema` and `<Noun>Input` (inferred type).
- Page entry: `<feature>.page.tsx` — the route file (`routes/<x>.tsx`) is one line of wiring (`createFileRoute → component: <FeaturePage>`). The `.page` suffix is non-negotiable: it disambiguates routes / pages / forms / cards in the same folder.

**Rules:**

1. The page lives in `<feature>.page.tsx`. Components go in `_components/` (flat — add `_components/<group>/` only when one group has 5+ files).
2. Hooks **never** call `fetch` directly — they go through `adapters/api-client.ts` (Hono RPC).
3. Schemas are zod, with `z.infer` exporting the type next to the schema.
4. **Forms live in `_forms/<action>-form.tsx`**, isolated from their host. The host (Card, Sheet, Dialog…) only does layout; the form owns RHF state, `zodResolver`, validation, submit. Pages stay composable, forms reusable across hosts.
5. Cross-feature reuse is not pre-solved. When two features need the same `UserCard`, decide then: extract to `packages/ui` if presentational, or promote one feature to own it.

**Form contract:**

- `react-hook-form` + `zodResolver` from `@hookform/resolvers/zod` + shadcn `Form` primitives (`Form`, `FormField`, `FormItem`, `FormLabel`, `FormControl`, `FormMessage`).
- Always pass `defaultValues` to `useForm` (no flash of uncontrolled state).
- Submit goes through `form.handleSubmit((values) => mutation.mutate(values))` — never a manual `(e) => …`. The deprecated React `FormEvent` type stays out.
- The form imports its hook (`../_hooks/use-<action>`) and schema (`../_schemas/<thing>.schema`). Never `fetch` directly.

**Schema contract — split loose vs strict for the same field shape.** When a field is *captured* in one flow (sign-in: just transmit, server validates) and *created* in another (sign-up / reset: enforce strength), keep two schemas. Example: `passwordSchema` (`min(1)`) for sign-in, `strongPasswordSchema` (`min(12).max(128)` + lowercase / uppercase / digit) for sign-up + reset. Validating strength on sign-in locks out users with old simple passwords who legitimately need to log in to *change* them. Composition rules stay minimal — NIST SP 800-63B 2024 deprecates required special chars (pushes users to `Pa$$w0rd!`); for stronger guarantees swap the regex set for `zxcvbn-ts` later.

**Typography contract:**

- All text uses shadcn typography exports (`@packages/ui/components/ui/typography`): `TypographyH1/H2/H3/H4`, `TypographyP/Lead/Large/Muted/Small`, `TypographyBlockquote/InlineCode/List`. Named exports, not a namespace.
- Never raw `<h1 className="text-5xl font-bold">` or `<p className="text-muted-foreground text-sm">` in features. Custom typography belongs in the theme or the Typography component itself (rule 10).
- `className` on Typography components is reserved for **layout** (e.g. `mx-auto max-w-2xl text-balance`). Never override colors / weights / fonts there.

**Theme & dark mode:** `next-themes` provider in `providers/app-providers.tsx` (`attribute="class"`, `defaultTheme="system"`, `disableTransitionOnChange`). The toggle (`apps/app/src/common/components/theme-toggle.tsx`) uses View Transitions API for a circle-reveal animation, with `prefers-reduced-motion` fallback. The view-transition CSS lives in `packages/ui/src/styles/globals.css` (theme-level, rule 10).

**Queries / mutations / hooks — three forms, one decision tree.**

TanStack Query options factories (`queryOptions` / `mutationOptions`) compose better than hook wrappers: they're typed, prefetchable in `beforeLoad`, and let the call site override `onSuccess` / `onError` / `staleTime` / `select` per-use. Hook wrappers are reserved for cases where the workflow itself owns side-effects (toast, navigation, broadcast, cache invalidation) that always fire and aren't the call site's concern.

| Case | Where | Form |
|---|---|---|
| **Query** (any read) | `adapters/queries/<noun>.ts` | `xxxQueryOptions` factory via `queryOptions(...)`. Consumed via `useQuery(xxxQueryOptions)` and `queryClient.ensureQueryData(xxxQueryOptions)` in `beforeLoad`. |
| **Mutation, cross-feature or multi-step** (e.g. upload pipeline, signed URL refresh) | `adapters/mutations/<verb>.ts` | `xxxMutationOptions` factory via `mutationOptions(...)`. Consumed via `useMutation(xxxMutationOptions)`. The call site owns side-effects. |
| **Mutation feature-specific with bundled side-effects** (toast + navigate + invalidate + broadcast) | `features/<x>/_hooks/use-<verb>.ts` | Hook wrapping `useMutation`. The hook owns `onSuccess` / `onError`. Used by exactly one feature. |
| **Pure React utility** (no API, no workflow — e.g. `usePasskeySupported`, `useDebouncedValue`) | `features/<x>/_hooks/` if scoped, `adapters/` if generic | Plain hook. |

**Rule**: if a hook does nothing but `return useMutation({ mutationFn })`, it's an indirection — promote to a `mutationOptions` factory. The hook only earns its keep when it bundles side-effects that the call site must not have to remember.

**Cross-feature resource hooks** — when 2+ features need the same `useUser` / `useCart`, extract to `adapters/queries/`. Don't pre-emptively place them there.

### `mutationOptions` cookbook

**Where**: `apps/app/src/adapters/mutations/<verb-noun>.ts`. Verb is the action (`create-upload`, `delete-account`, `invite-member`); the file name mirrors the backend use-case (e.g. `apps/api/src/application/use-cases/create-upload-url.use-case.ts` ↔ `mutations/create-upload.ts`).

**Naming**: file = `<verb-noun>.ts`, export = `<verbNoun>MutationOptions`. Never prefix with `use-` — these are objects, not hooks. The `mutations/` folder makes the role unambiguous.

**Anatomy**:

```typescript
// adapters/mutations/create-widget.ts
import { mutationOptions } from "@tanstack/react-query";
import type { InferRequestType, InferResponseType } from "hono/client";
import { api } from "../api-client";

const $post = api.widgets.$post;
type Body = InferRequestType<typeof $post>["json"];
type Response = InferResponseType<typeof $post, 200>;

export interface CreateWidgetInput {
  // Public input shape — translates UI concerns (e.g. a `File`)
  // into the wire shape (`Body`). Use it as the type the call
  // site sees, so the factory absorbs presign / multi-step flows.
  // For trivial pass-throughs, `Body` directly is fine.
}

async function createWidget(input: CreateWidgetInput): Promise<Response> {
  const res = await $post({ json: /* … */ });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export const createWidgetMutationOptions = mutationOptions({
  mutationKey: ["widgets", "create"] as const,
  mutationFn: createWidget,
});
```

**Consume** — at the call site, the page or component owns the side-effects:

```typescript
// features/widgets/_components/create-widget-form.tsx
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { createWidgetMutationOptions } from "../../../adapters/mutations/create-widget";
import { widgetsQueryOptions } from "../../../adapters/queries/widgets";

export function CreateWidgetForm() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const { mutate, isPending } = useMutation({
    ...createWidgetMutationOptions,
    onSuccess: async (widget) => {
      toast.success(`Widget ${widget.name} created`);
      await queryClient.invalidateQueries({
        queryKey: widgetsQueryOptions.queryKey,
      });
      void navigate({ to: "/widgets/$id", params: { id: widget.id } });
    },
    onError: (err) => toast.error(err.message),
  });

  return <form onSubmit={form.handleSubmit((v) => mutate(v))}>…</form>;
}
```

**Rules**:

1. **Side-effects belong to the call site, not the factory.** No `toast` / `navigate` / `invalidateQueries` inside the `mutationOptions` body. The factory does **only** the network work. Different call sites have different success messages and different post-success destinations — keep them free.
2. **Spread, don't override.** Compose at the call site with `useMutation({ ...createWidgetMutationOptions, onSuccess: … })`. Never mutate the exported options object.
3. **`mutationKey`** is `[<resource>, <verb>]` (e.g. `["uploads", "create"]`). Lets `useIsMutating({ mutationKey })` and `queryClient.getMutationCache().findAll({ mutationKey })` find in-flight mutations.
4. **Types via `InferRequestType` / `InferResponseType<…, 200>`.** The status discriminant (`200`) narrows to the success shape — pair with `if (!res.ok) throw` so the function's signature stays accurate.
5. **Multi-step workflows go in the factory** (presign → PUT → confirm in `create-upload`). The factory presents a single `mutationFn` that returns server-verified output. The call site never reasons about the intermediate steps.
6. **Hook only when side-effects are truly bundled** (sign-in: toast + refetch session + broadcast + navigate, every call). If the side-effects vary per call site, factory + per-call override is the better fit.
7. **`AbortSignal`**: factories that do a single API call thread it via `init.signal`. Multi-step flows with cleanup logic typically can't honour cancellation cleanly — document this in a comment if the factory does not propagate `signal`.

**Composition patterns:**

- **Cards**: use the slots — `Card` + `CardHeader` + `CardTitle` + `CardContent` (+ optional `CardDescription`, `CardFooter`). The primitive already provides `py-6` / `gap-6`; never re-add `pt-6` / `space-y-4` to compensate for a skipped slot.
- **Numbered / iconic markers** (steps, status pills): `Badge variant="secondary"` with layout classes (`size-6`, `font-mono`). Don't hand-roll `<span className="rounded-full bg-secondary …">`.
- **Styled links / nav items**: a primitive owns *style*, a router component owns *navigation*. Compose via `asChild`:

  ```tsx
  <NavLink asChild>
    <Link to="/dashboard">Dashboard</Link>
  </NavLink>
  ```

  `NavLink` (`@packages/ui/components/ui/nav-link.tsx`) holds the muted color + hover; TanStack `<Link>` holds typed routes, hash, active state, prefetch. Same for `<Button asChild><Link …/></Button>`.
- **List bullets**: lucide icons (`<Dot />`, `<Check />`, `<Minus />`) over custom `<span>`s. Sized via `size-*`, colored via theme tokens.

**Rule of thumb**: raw `<a className="text-…">`, `<span className="… rounded-full bg-…">`, or `<div className="… rounded-lg border bg-…">` in a feature = skipped slot or duplicated primitive — promote, don't patch (rule 14).

## Route gates (pathless layouts)

Auth state is enforced by **pathless layouts**, not by per-route `beforeLoad` duplication.

```
routes/
  __root.tsx                  passthrough (component: Outlet)
  _protected.tsx              redirects to /sign-in if no session
  _protected/dashboard.tsx    URL: /dashboard (inherits the gate)
  _guest.tsx                  redirects to /dashboard if session exists
  _guest/sign-in.tsx          URL: /sign-in
  _guest/sign-up.tsx          URL: /sign-up
```

The `_` prefix tells TanStack Router this segment is not part of the URL — it hosts a shared `beforeLoad`. URL-wise, `_guest/sign-in.tsx` resolves to `/sign-in`.

**Naming**: by access *condition*, not feature. `_protected` = "must be authenticated", `_guest` = "must NOT be authenticated". Antonymic and reads at a glance. Avoid `_auth` (ambiguous: routes *about* auth vs routes *requiring* auth).

**Single source of session truth — TanStack Query, not React state.** Router context only exposes `queryClient`. Each gate's `beforeLoad` reads via `await context.queryClient.ensureQueryData(sessionQueryOptions)` (`adapters/queries/session.ts`, staleTime 5 min — aligned with BetterAuth `cookieCache.maxAge`). No `useSession()` React bridge, no race between nanostores and `beforeLoad`.

```ts
// _protected.tsx
beforeLoad: async ({ context, location }) => {
  const session = await context.queryClient.ensureQueryData(sessionQueryOptions);
  if (!session) throw redirect({ to: "/sign-in", search: { redirect: location.href } });
  return { user: session.user };
}
```

**After auth mutations, push state into the query, then navigate.** Sign-in / verify-email / magic-link / 2FA-verify do `await queryClient.refetchQueries({ queryKey: sessionQueryOptions.queryKey })` (cookie is set; refetch pulls the canonical shape). Sign-out does `queryClient.setQueryData(sessionQueryOptions.queryKey, null)` (result is known, no roundtrip). Then `void navigate({ to: ... })`.

**Token-consuming pages stay outside the gates** — `/verify-email?token=…`, `/reset-password?token=…`, `/magic-link?token=…`, `/two-factor`. Putting them under `_guest` would 302 them away the moment the consumed token signed the user in. They handle their own state. Token-consume effects use a `useRef(false)` guard against React StrictMode double-fire (single-use tokens would otherwise be invalidated by the second invocation in dev).

**Realtime cross-tab sync via `BroadcastChannel`** — `adapters/auth-broadcast.ts` (~15 LoC, native web API, stable since 2017). Auth mutations call `broadcastAuthChange()` which posts `{ type: "session-changed" }` on the `clean-stack-auth` channel. `app-providers.tsx` listens once via `onAuthChange(...)` and on receive does `refetchQueries(['session'])` + `router.invalidate()`. Tab A signs out → tab B (idle on `/dashboard`) instantly transitions to `/sign-in`, no polling, no hard reload, no navigation needed in B. The signal carries no payload — cookie is shared, each tab refetches against live server state, `cookieCache` keeps it cheap. **Use this for any auth state change** (sign-in, sign-out, verify-*, 2FA, future org switch / role change / impersonation — just add a new event type).

## Auth (BetterAuth integration)

BetterAuth ships as a **module-level singleton** (`apps/api/src/auth.ts`). Not wrapped in a port/adapter, not registered in inwire — wrapping would only recopy `auth.api.*` and lose the strong typing of `auth.$Infer.*`. Every consumer imports `auth` directly.

**Server pipeline** (in order, in `index.ts`):

1. `requestId()` — seeds `c.var.requestId` for log correlation.
2. `httpLogger` (hono-pino).
3. `secureHeaders()`, `cors({ origin: env.CORS_ORIGIN, credentials: true })`.
4. `sessionMiddleware` (`adapters/middleware/auth.middleware.ts`) — calls `auth.api.getSession()` once per request, stores `user` / `session` on the context. Skips `/api/auth/*`.
5. Mount `app.on(["GET", "POST"], "/api/auth/*", (c) => auth.handler(c.req.raw))`.
6. `app.onError(errorHandler)`.

Protected handlers compose `requireAuth` (same file) — reads the resolved session and throws `HTTPException(401)` if absent. **Never re-call `auth.api.getSession()` per handler** — one read per request.

```typescript
.get("/me", requireAuth, (c) => c.json({ user: c.get("user") }))
```

**Client** (`apps/app/src/adapters/auth-client.ts`): one `createAuthClient` with the same plugin set as the server (`twoFactorClient`, `magicLinkClient`, `passkeyClient`). Consumers import `authClient` directly — no re-exports. Session reads go through TanStack Query (`sessionQueryOptions`), not the BetterAuth nanostore.

**Non-negotiable defaults:**

- **`session.cookieCache: { enabled: true, maxAge: 5 * 60 }`** — auth check is signature-only between refreshes (no DB hit). DB is source of truth at expiry → instant revoke. Keep `maxAge` ≤ 15 min so revocation lag stays acceptable.
- **`bearer()` plugin** — alongside cookies, enables `Authorization: Bearer <token>`. Web stays cookie-based (httpOnly, XSS-safe); Capacitor / mobile uses bearer with secure storage. Same session row in DB — only transport differs.
- **Cookies**: `httpOnly: true`, `sameSite: "lax"`, `secure: isProd` in `auth.advanced.defaultCookieAttributes`.

**Email URLs route through the app, not the API.** Every email link points to `${env.APP_URL}/<route>?token=...`. The frontend route consumes the token via the typed client (`authClient.verifyEmail({ query: { token } })`, `authClient.resetPassword({ newPassword, token })`, `authClient.magicLink.verify({ query: { token } })`). Reasons: branded UX (loading / error / redirect); avoids Outlook/Gmail re-autolinking the visible URL text and mangling `?callbackURL=...` (use a short label like "Verify your email", never the full URL, so re-autolinking has nothing to grab). Apply the same pattern when adding new auth-token emails (org invitations, etc.):

```typescript
sendInvitation: async ({ email, token }) => {
  const url = `${env.APP_URL}/org/accept-invite?token=${encodeURIComponent(token)}`;
  await sendEmail({ to: email, subject: "...", html: `<p><a href="${url}">Accept invitation</a></p>` });
}
```

## Logging & error handling

**No `console.*` in production paths.** All logs go through `pino` (`apps/api/common/logger.ts`): JSON to stdout in prod (Datadog, Loki consume directly), `pino-pretty` single-line in dev. Level: `info` prod, `debug` dev.

**HTTP logger** (`adapters/middleware/logger.middleware.ts`): `hono-pino` with `referRequestIdKey: "requestId"` so every line carries the same request id as the response payload. Status-driven: `5xx → error`, `4xx → warn`, `2xx/3xx → info`.

**Error handler** (`adapters/middleware/error.middleware.ts`): one `app.onError(errorHandler)`, no per-route `try/catch` for HTTP wrapping.

- `HTTPException` → `{ error: { code: "HTTP_<status>", message, requestId } }`. Logged at `error` only when `status >= 500`.
- Anything else → `500` `{ error: { code: "INTERNAL_ERROR", message: "Internal Server Error", requestId, stack? } }`. Logged with full error + request context. Stack only outside production.

**Throwing the right exception is the API.** Domain & application use `Result<T, E>` (no throw). At the controller boundary, translate failures to `HTTPException(<status>, { message })`. The handler does the rest. Never invent a custom error envelope per route — the envelope above is the contract for the whole API.

## Storage (R2-first, MinIO for dev)

**Server is blind during the upload.** The client `PUT`s **directly** to R2/MinIO using the presigned URL — the API only sees `presign` (issue URL) and `confirm` (verify after). Three-step flow, in order:

1. **`POST /uploads/presign`** — auth + Zod (`filename`, `contentType`, `size`, `scope`, `expiresInSeconds?`). `CreateUploadUrlUseCase` clamps TTL to `[STORAGE_PRESIGN_TTL_MIN_SECONDS, STORAGE_PRESIGN_TTL_MAX_SECONDS]`, generates the **owner-scoped key** `<userId>/<scope>/<uuid>-<filename>`, calls `IStorageService.presignUpload`. Adapter signs `content-type` + `content-length` (`signableHeaders`) so the client can't drop them — sending different headers fails with 403 `SignatureDoesNotMatch`. Response includes `expectedSize` + `expectedContentType` (echo of the declared values, used by `confirm`).
2. **Client `PUT <signed_url>`** — direct to R2, exact `Content-Type` + `Content-Length` headers, file body. Zero proxy through the API.
3. **`POST /uploads/confirm`** — auth + Zod (`key`, `expectedSize`, `expectedContentType`). `ConfirmUploadUseCase` enforces **owner check** (`key.startsWith("<userId>/")` → 403 `STORAGE_FORBIDDEN`), then `HeadObject` to read real `size`/`contentType`. **Size is permissive** (only fails if `actual > expected` — undershooting is fine, e.g. client-side compression produced a smaller payload than estimated). **Content-type is strict** (must match exactly). On mismatch: `DeleteObject` + 422 `STORAGE_INTEGRITY_FAILED` (delete failure is propagated as `STORAGE_PROVIDER_FAILURE`, never silently swallowed). On success: returns `{ key, size, contentType, publicUrl }` — the only metadata the rest of the app should trust.

**Why three steps**: R2 does not support Presigned POST policies (no `content-length-range` condition, verified 2026). Signed `ContentLength` blocks naïve clients (different declared header → 403) but R2 does not verify the body size against it — `confirm` is the real enforcement. Same logic for content-type.

**Download** (`POST /uploads/download`) — symmetric: auth + Zod, `CreateDownloadUrlUseCase` runs the same owner check, presigns a `GetObjectCommand`, returns `{ url, expiresAt }`.

**Architecture rules specific to this section**:

1. **Port = pure transport.** `IStorageService` only exposes SDK-level operations (`presignUpload`, `presignDownload`, `headObject`, `deleteObject`, `publicUrlFor`). Zero business rules in the adapter.
2. **Use-cases = orchestration only.** Key generation, owner check, TTL clamping, integrity verification. No `throw` — return `Result<T, StorageError>`.
3. **Validation lives in the route's Zod schema** — filename regex (`^[\w\-. ]+$`), scope regex (`^[a-z][a-z0-9-]{0,31}$`), size cap (`STORAGE_MAX_UPLOAD_BYTES`), max TTL. Zod failures become 400 via the centralised error handler. Use-cases trust their input.
4. **Routes = thin controllers.** Resolve the use-case from the inwire container (`di.CreateUploadUrlUseCase`, `di.ConfirmUploadUseCase`, `di.CreateDownloadUrlUseCase`), `await execute(...)`, map `Result` → HTTP via the central `statusFor(error)` switch. Error mapping: 403 (`STORAGE_FORBIDDEN`), 404 (`STORAGE_NOT_FOUND`), 422 (`STORAGE_INTEGRITY_FAILED`), 502 (`STORAGE_PROVIDER_FAILURE`). The `requireAuth` middleware narrows `c.get("user")` to a non-null `SessionUser` — no manual null guard in the handler.
5. **R2-first, MinIO is dev convenience.** `S3Client` config: `region: "auto"` (R2's only accepted value), `forcePathStyle: true` (harmless on R2, required for MinIO). Boot-time fail-hard if `NODE_ENV === "production"` and `S3_ENDPOINT` is localhost or creds are default `minioadmin`. R2 prod endpoint: `https://<ACCOUNT_ID>.r2.cloudflarestorage.com` (or `…eu.r2.cloudflarestorage.com` for EU jurisdiction — once chosen, R2 cannot move the bucket).
6. **`createUploadMutationOptions` chains all three calls.** The factory (`apps/app/src/adapters/mutations/create-upload.ts`) only resolves after `confirm` succeeds. The UI consumes via `useMutation({ ...createUploadMutationOptions, onSuccess, onError })` and receives server-verified metadata or an explicit error — never a "maybe uploaded" intermediate state. The client PUT explicitly sends `Content-Length: String(file.size)` to match the server-signed header (browsers would inject it anyway, but stating it is the documented contract).

**Phase 2 (deferred until first concrete consumer)**:
- **Orphan GC**: client may crash between `PUT` and `confirm`, leaving an unreferenced object. Add a worker (R2 prod: Cloudflare Worker on a cron; dev: Bun cron) that deletes objects older than X minutes with no DB row referencing the key. Requires the first business table that stores keys (Avatar, Document, …).
- **Integration event bus**: when 2+ handlers need to react to `UploadConfirmedEvent` (e.g. avatar update + audit log + push notif), promote an `IAppEventBus` port (distinct from domain events — those stay reserved for aggregates). The current single-consumer call from `ConfirmUploadUseCase` is a direct call by design (rule 14: promote on second occurrence).

## Domain Events

Events are *added* in aggregate methods (`this.addEvent(...)`), NOT dispatched there. Dispatch happens in use cases AFTER successful persistence:

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

- `ui: "tui"` in `turbo.json` — daemon auto-managed since v2.x, no flags needed.
- `globalDependencies`: `biome.json`, `pnpm-workspace.yaml`, `.env*` — modifying these busts every cache.
- `inputs` scoped per task (build/test/type-check) — README/doc edits do NOT invalidate code caches.
- `build` declares `with: ["type-check"]` — `pnpm build` runs type-check in parallel for free.
- `dev`, `test:watch`, `db:studio` are `interruptible: true` — clean ctrl+C kill on next reload.

## Useful scripts

- `pnpm dev` — Turbo TUI dev (`pnpm dev --filter=api` to filter)
- `pnpm build` / `test` / `type-check` — Turbo orchestrated
- `pnpm check` (Biome lint+format) / `fix` (auto-fix) / `ci:check` (CI lint)
- `pnpm check:duplication` (jscpd) / `check:unused` (knip)
- `pnpm db:push` / `db:generate` / `db:migrate` / `db:seed` / `db:studio`
- `pnpm clean` — wipe `node_modules`, `.turbo`, `dist`

## DB

- `docker compose up -d` from repo root — Postgres on `localhost:5433`.
- Schema in `packages/drizzle/src/schema/*.ts`.
- After schema change: `pnpm db:push` (dev) or `pnpm db:generate && pnpm db:migrate` (prod-style).

## Release flow

Two-branch model. **`main` is the released branch — every merge to `main` triggers semantic-release.** `dev` is the integration branch where work accumulates between releases.

- Daily work happens on `dev` (or feature branches PR'd into `dev`). Pushing to `dev` does **not** trigger a release.
- Shipping is deliberate: open a PR `dev` → `main`, merge it. `release.yml` runs, semantic-release analyzes **all** commits since the last tag and produces one bundled bump + changelog.
- **`dev` → `main` MUST be a merge commit** (not squash, not rebase). Squash collapses every conventional commit into one, semantic-release would only see one entry. The repo is configured GitHub-side to allow merge commits only.
- `main` is protected (require PR, no force push, conversation resolution required). If a CI fix is needed during release, do it on `dev` and re-merge.
- **Don't release on every commit** — wait for a meaningful batch (a feature complete, a coherent set of fixes). Cadence is controlled by *when you merge to main*, not by `.releaserc.json` / `release.yml` (those stay as-is).

```bash
git checkout dev && git push   # no release
gh pr create --base main --head dev --title "Release: <theme>"
# merge via "Create a merge commit" on GitHub UI
# → release.yml runs, one consolidated tag + changelog drops
```

## Don't

- Add business features without first agreeing on the bounded context.
- Throw in domain or application; use `null` for absence; add `index.ts` barrels; add inline comments that restate what the code does.
- Reintroduce `@hono/node-server`, `tsx`, `tsc-alias` — the API runs on Bun natively.
- Pin Postgres back to port 5432 — collides with other local Postgres instances.
- Break Hono RPC by un-chaining routes (`app.get(...); app.post(...)`) — types accumulate via chaining.
- Call `fetch` directly in features — use `api` from `adapters/api-client.ts`.
- Wrap BetterAuth in a port/service or register it in inwire — `auth` is the integration. Import directly.
- Re-call `auth.api.getSession()` per route handler — `sessionMiddleware` reads it once; `requireAuth` / `c.get("user")` does the rest.
- Embed the API verification URL in an email — every link points to `${env.APP_URL}/<route>?token=...`, the frontend page consumes via the typed client. Use a short label as link text, never the full URL (email clients re-autolink and corrupt it).
- Sprinkle `console.log` / `console.error` in handlers — go through `pino` and the centralised error handler.
- Duplicate `beforeLoad` auth checks per route — host them on a pathless layout (`_protected.tsx` / `_guest.tsx`).
- Push directly to `main` or merge `dev` → `main` with squash/rebase — squash destroys the conventional-commit history semantic-release reads.
- Put session data in `router.context` or sync via `useSession()` React boundary — race between nanostores and `beforeLoad`. Read via `ensureQueryData(sessionQueryOptions)`; context only exposes `queryClient`.
- `await navigate(...)` in `useMutation.onSuccess` — keeps the mutation pending during transition, blocks the submit button. Use `void navigate(...)`.
- Mutate session-changing flows without calling `broadcastAuthChange()` — other tabs stay stuck on stale data until next navigation.
- Validate password strength on the **sign-in** form — only on sign-up / reset. Users with legacy weak passwords must still be able to log in to change them.
- Type component props with `type` — use `interface <Component>Props { ... }`. `type` is for unions / intersections / mapped shapes / zod-inferred types.
- Consume a single-use token from `useEffect` without a `useRef(false)` guard — StrictMode double-fire would invalidate the token even though the first call succeeded.
- Pass `redirectTo` / `callbackURL` to BetterAuth client methods when the corresponding `send*` server hook already builds the URL — duplicate dead code that can later silently override the canonical URL.
- Wrap a one-liner mutation in a custom hook (`useUpload`, `useCreateX`) that only does `return useMutation({ mutationFn })` — promote to a `mutationOptions` factory in `adapters/`. Hook wrappers earn their keep only when bundling side-effects (toast + navigate + invalidate + broadcast) that callers should not have to repeat.
- Trust the size or content-type a client declares at `presign` time without running `confirm` — the server is blind during the upload (client `PUT`s direct to R2). The signed `Content-Length` only blocks naïve clients; integrity is enforced by `HeadObject` + `DeleteObject` on mismatch. Skipping `confirm` = trusting the client.
- Skip the owner-prefix check (`key.startsWith("<userId>/")`) in download or confirm use-cases — without it any authenticated user can presign a GET / verify any key in the bucket.
- Stuff business rules into `IStorageService` (validation, key shape, ACLs) — port stays pure transport. Rules belong in the use-case (orchestration) or the route's Zod schema (input validation).
- Add a Presigned POST flow to upload to R2 — R2 does not implement POST policies (verified 2026, see ROADMAP). PUT presigned + `confirm` is the correct shape.
