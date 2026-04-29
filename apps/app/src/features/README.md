# features/

User-facing workflows. One folder per workflow.

File naming follows **Next.js App Router conventions** wherever it doesn't conflict with TanStack Router (which owns `routes/`).

Anatomy (only create sub-folders that earn their place):

- `page.tsx` — feature entry component, mounted by the route
- `layout.tsx` — (optional) feature-level layout wrapper
- `loading.tsx` — (optional) wired as the route's `pendingComponent`
- `error.tsx` — (optional) wired as the route's `errorComponent`
- `_components/` — private colocated components (one component per file, kebab-case)
- `_forms/` — private isolated forms (RHF + zodResolver + shadcn `Form`). Section components mount them; sections never own form state.
- `_hooks/` — private feature-local React hooks (queries, mutations, local state)
- `_schemas/` — private zod schemas

The `_` prefix mirrors Next's "private folder" convention. Inside `features/` it has no routing effect (TanStack scans `routes/` only); we keep it for **visual parity with Next** and as a convention for "internal to this feature".

**Form contract** (`_forms/<action>-form.tsx`):

- `react-hook-form` + `@hookform/resolvers/zod` + shadcn `Form` primitives.
- Always pass `defaultValues` to `useForm`.
- Submit: `form.handleSubmit((values) => mutation.mutate(values))` — never wrap in a manual `(e) => …` handler. The deprecated React `FormEvent` type stays out.
- The form imports its hook (`../_hooks/use-<action>`) and schema (`../_schemas/<thing>.schema`). Never `fetch` directly.

**Typography contract:**

- All headings/paragraphs go through `@packages/ui/components/ui/typography` exports: `TypographyH1`, `TypographyH2`, `TypographyH3`, `TypographyH4`, `TypographyP`, `TypographyLead`, `TypographyLarge`, `TypographyMuted`, `TypographySmall`, `TypographyBlockquote`, `TypographyInlineCode`, `TypographyList`.
- Never write raw `<h1 className="text-5xl font-bold ...">` or `<p className="text-muted-foreground text-sm">` in features. Custom typography classes belong in the theme or in the Typography component itself, not inline.
- Override via `className` only for **layout** concerns (e.g. `border-0 pb-0` to drop the H2 separator when used as a centered section title) — never for color, weight, or font.

**HTML semantics:**

- Each `page.tsx` owns its document landmarks: exactly **one `<main>`** per page, plus optionally `<header>`, `<footer>`, `<nav>`, `<aside>`.
- `routes/__root.tsx` is a passthrough (`component: Outlet`) — it never wraps the outlet in a landmark, so pages are free to define their own without nesting.
- Sections inside the page use `<section>` with an `id` when they're navigation targets (e.g. `<section id="stack">`).
- One `TypographyH1` per page (in the hero), `TypographyH2` for top-level sections, `H3`/`H4` for nested headings.

**Zero-warning pipeline:**

- Husky / lint-staged / commit-msg / pre-push / `pnpm ci:check` must run **clean** before pushing — no warnings, no errors.
- Never bypass with `--no-verify`. If a Biome warning is genuinely intentional (a11y `!important`, regex with intentional duplication, etc.), silence it with a targeted ignore + reason: `/* biome-ignore <rule>: <why> */`. Never disable rules globally.

May import from: `adapters/`, `common/`, `@packages/ui`, `@packages/ddd-kit`.
Must NOT import from: other `features/`, `routes/`, `providers/`.
