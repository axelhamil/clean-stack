# App rules

Vite+React 19+TanStack Router/Query+Tailwind 4+shadcn. Loaded automatically by Claude Code when working anywhere under `apps/app/`. Root rules (philosophy, stack, release flow) live in `/CLAUDE.md`. Deeper sub-CLAUDE.md inside `src/features/` and `src/shared/` carry layer-specific rules.

## Layout

```
apps/app/src/
  main.tsx                      createRoot + <AppProviders />
  router/layouts.tsx            Layouts + gates (root + pathless `_guest`/`_protected`/`_shell`/`_org-scope` + settings)
  router.tsx                    Pure assembly: imports + `routeTree.addChildren(...)` → `createRouter`
  shared/                       Cross-cutting (no business) — see src/shared/CLAUDE.md
  features/<feature>/           Sub-domain — see src/features/CLAUDE.md
```

## Import direction

`router.tsx` → `features/` → `shared/`. No cross-feature imports between route-owning features. No barrels.

- `router.tsx` → `router/layouts`, `features/<x>/<x>.route.tsx`, `shared/`
- `router/layouts.tsx` → `shared/`, `@packages/*` (features import FROM here)
- `features/<x>/` (route-owning) → `router/layouts`, `shared/`, `@packages/*`, `features/<library-feature>/`
- `features/<library-feature>/` → `shared/`, `@packages/*`. Never imports from other features.
- `shared/<sub>/` → `shared/<sibling>/`, `shared/env.ts`, `shared/utils.ts` (no upward imports)

## Naming

Files `kebab-case.tsx`; components `PascalCase` named exports; hooks `use-<verb>-<noun>.ts` → `useVerbNoun`; schemas `<feature>.schema.ts` → `<noun>Schema`+`<Noun>Input` (z.infer).

## App-wide rules

1. **`className` is for layout only** — `flex` (default), `w-*`, `h-*`, `mx-auto`, `gap-*`, responsive breakpoints. **`grid` reserved for true 2D**; `flex flex-col gap-*` for any vertical stack. Colors/typography/radius/shadows/look-defining paddings live in **theme** (`@theme` in `globals.css`) or in the primitive itself. Inline `bg-foo text-bar p-3` = theme drift = no design system.
2. **Always shadcn first, stay shadcn-pure** — check `@packages/ui/components/ui/*` and the [shadcn registry](https://ui.shadcn.com/docs/components) before custom. **Use the actual slots** (`Card`+`CardHeader`+`CardTitle`) — wrong slot forces hacks (`pt-6`, `space-y-4`). No wrapper variants, no `data-slot="*"` overrides. Adjustments → theme or primitive. Custom (last resort) lives in `@packages/ui/components/ui/*`, never inline in a feature.
3. **Exactly one `<main>` per rendered page**. `__root.tsx` and pathless gates are passthroughs (`component: Outlet`) — never wrap in landmarks. Each `<feature>.page.tsx` owns its `<header>`/`<main>`/`<footer>`. Same for `<h1>` (one per page).

**Theme & dark mode**: `next-themes` (`attribute="class"`, `defaultTheme="system"`, `disableTransitionOnChange`). Toggle uses View Transitions API with `prefers-reduced-motion` fallback. View-transition CSS in `globals.css`.

**Typography contract**: text via shadcn typography exports (named, not namespace). Custom typography → theme or Typography component. `className` on Typography for layout only.
