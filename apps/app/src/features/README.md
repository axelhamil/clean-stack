# features/

User-facing sub-domains (vertical slice). One folder per sub-domain — never per area. Areas (`/settings/*`, `/admin/*`) live as **pathless layout nodes declared in `apps/app/routes.ts`**, backed by a `router/*.tsx` layout component, not as folders here.

Two flavors of feature:

- **Route-owning** (most): exposes a single `<name>.route.tsx` at feature root for each URL — route definition and page component in one file.
  - `<name>.route.tsx` — `export const Route = createFileRoute("/full/path/id")({ beforeLoad, validateSearch, component: <Name>Page })`, with `function <Name>Page() { ... }` defined **below it, never exported**. The route id is a string literal, checked through `Register` — it must match the id the route has in `apps/app/routes.ts`. Access route context/search/params via `Route.useRouteContext()` / `Route.useSearch()` / `Route.useParams()`.
  - A new route also needs one entry added to `apps/app/routes.ts` (the `virtualRouteConfig` tree) — the file alone renders nothing.
  - Examples: `auth/sign-in.route.tsx`, `billing/billing.route.tsx`, `dashboard/dashboard.route.tsx`, `account/account.route.tsx`.
- **Library** (zero-route compositional bundles): no `.route.tsx`, only components/forms/hooks designed to be composed by a route-owning feature's route file. Examples: `security/` (passkeys + 2FA + sessions cards), `rgpd/` (data export + deletion cards). A route-owning route file MAY import from a library feature; the reverse is forbidden.

The route id lives in `createFileRoute("/full/path/id")` and the tree wiring in `apps/app/routes.ts`; the page component must stay **internal and unexported** — `autoCodeSplitting` only chunks a component local to its route file, so exporting it silently pulls it back into the main bundle.

Anatomy (only create sub-folders that earn their place):

- `<name>.route.tsx` — `export const Route = createFileRoute("/full/path/id")({ ..., component: <Name>Page })` with `function <Name>Page() { ... }` (never exported) below it. Route-owning features only. Wired into the tree via one entry in `apps/app/routes.ts`.
- `<feature>.schema.ts` — feature-private zod schemas (single-schema feature; promote to `schemas/` subfolder on 2nd file)
- `components/` — feature-private colocated components (one component per file, kebab-case)
- `forms/` — feature-private isolated forms (RHF + zodResolver + shadcn `Form`). Section components mount them; sections never own form state.
- `hooks/` — feature-private React hooks (queries, mutations, local state)
- `api/` — feature-scoped query/mutation `*Options` factories (cross-feature ones live in `shared/api/`)

**No underscore-private folders** — `_components/` is a Next.js App Router convention for *route* files; feature folders aren't routes, the convention doesn't transfer.

**Form contract** (`forms/<action>-form.tsx`):

- `react-hook-form` + `@hookform/resolvers/zod` + shadcn `Form` primitives.
- Always pass `defaultValues` to `useForm`.
- Submit: `form.handleSubmit((values) => mutation.mutate(values))` — never wrap in a manual `(e) => …` handler. The deprecated React `FormEvent` type stays out.
- The form imports its hook (`../hooks/use-<action>`) and schema (`../<feature>.schema` or `../schemas/<thing>.schema`). Never `fetch` directly.

**Typography contract:**

- All headings/paragraphs go through `@packages/ui/components/ui/typography` exports: `TypographyH1`, `TypographyH2`, `TypographyH3`, `TypographyH4`, `TypographyP`, `TypographyLead`, `TypographyLarge`, `TypographyMuted`, `TypographySmall`, `TypographyBlockquote`, `TypographyInlineCode`, `TypographyList`.
- Never write raw `<h1 className="text-5xl font-bold ...">` or `<p className="text-muted-foreground text-sm">` in features. Custom typography classes belong in the theme or in the Typography component itself, not inline.
- Override via `className` only for **layout** concerns (e.g. `border-0 pb-0` to drop the H2 separator when used as a centered section title) — never for color, weight, or font.

**HTML semantics:**

- Each Page component owns its document landmarks: exactly **one `<main>`** per page, plus optionally `<header>`, `<footer>`, `<nav>`, `<aside>`.
- The root route (`router/__root.tsx`) is a passthrough (`component: () => <Outlet />`) — it never wraps the outlet in a landmark, so pages are free to define their own without nesting.
- Sections inside the page use `<section>` with an `id` when they're navigation targets (e.g. `<section id="stack">`).
- One `TypographyH1` per page (in the hero), `TypographyH2` for top-level sections, `H3`/`H4` for nested headings.

**Zero-warning pipeline:**

- Husky / lint-staged / commit-msg / pre-push / `pnpm ci:check` must run **clean** before pushing — no warnings, no errors.
- Never bypass with `--no-verify`. If a Biome warning is genuinely intentional (a11y `!important`, regex with intentional duplication, etc.), silence it with a targeted ignore + reason: `/* biome-ignore <rule>: <why> */`. Never disable rules globally.

May import from: `router/*.tsx`, `shared/`, `@packages/ui`, `features/<library-feature>/` (route-owning features only).
Must NOT import from: other route-owning `features/`, `routes.ts`.
