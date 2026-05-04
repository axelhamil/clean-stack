# features/

User-facing sub-domains (vertical slice). One folder per sub-domain — never per area. Areas (`/settings/*`, `/admin/*`) live as **layout routes inside `apps/app/src/router.tsx`**, not as folders here.

Two flavors of feature:

- **Route-owning** (most): exposes one or more `<name>.route.tsx` files at feature root. Each does `export const <name>Route = createRoute({ getParentRoute: () => <parent>, ... })` where `<parent>` is imported from `../../router/layouts` (e.g. `shellLayout`, `guestLayout`, `orgScopeLayout`, `rootRoute`). Search params, route context, params accessed as `<name>Route.useSearch()` / `.useRouteContext()` / `.useParams()` — full TanStack typing flows from the parent. Examples: `auth/`, `billing/`, `dashboard/`, `account/`, `organization/`, `team/`, `invitations/`, `legal/`.
- **Library** (zero-route compositional bundles): no `<name>.route.tsx`, only components/forms/hooks designed to be composed by a route-owning feature. Examples: `security/` (passkeys + 2FA + sessions cards), `gdpr/` (data export + deletion cards). A route-owning feature MAY import from a library feature; the reverse is forbidden.

Anatomy (only create sub-folders that earn their place):

- `<name>.route.tsx` — `export const <name>Route = createRoute({...})` + co-located Page component (route-owning features only). Parent imported from `../../router/layouts`.
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
- The root route in `router.tsx` is a passthrough (`component: () => <Outlet />`) — it never wraps the outlet in a landmark, so pages are free to define their own without nesting.
- Sections inside the page use `<section>` with an `id` when they're navigation targets (e.g. `<section id="stack">`).
- One `TypographyH1` per page (in the hero), `TypographyH2` for top-level sections, `H3`/`H4` for nested headings.

**Zero-warning pipeline:**

- Husky / lint-staged / commit-msg / pre-push / `pnpm ci:check` must run **clean** before pushing — no warnings, no errors.
- Never bypass with `--no-verify`. If a Biome warning is genuinely intentional (a11y `!important`, regex with intentional duplication, etc.), silence it with a targeted ignore + reason: `/* biome-ignore <rule>: <why> */`. Never disable rules globally.

May import from: `router/layouts`, `shared/`, `@packages/ui`, `@packages/ddd-kit`, `features/<library-feature>/` (route-owning features only).
Must NOT import from: other route-owning `features/`, `router.tsx`.
