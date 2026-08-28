# App rules

Vite+React 19+TanStack Router/Query+Tailwind 4+shadcn. Loaded automatically by Claude Code when working anywhere under `apps/app/`. Root rules (philosophy, stack, release flow) live in `/CLAUDE.md`. Deeper sub-CLAUDE.md inside `src/features/` and `src/shared/` carry layer-specific rules.

## Layout

```
apps/app/
  routes.ts                     Virtual route tree — rootRoute/layout/route/index, paths relative to routesDirectory "./src"
  src/
    main.tsx                    createRoot + <AppProviders />
    router.tsx                  Pure assembly: createRouter({ routeTree }) — routeTree.gen.ts is generated + gitignored
    router/                     One file per layout/gate (`__root.tsx`, `_guest.tsx`, `_protected.tsx`, `_shell.tsx`, `_admin.tsx`, `_org-scope.tsx`, `settings.tsx`) + non-route leaves (`index.route.tsx`, `settings-index.route.tsx`)
    shared/                     Cross-cutting (no business) — see src/shared/CLAUDE.md
    features/<feature>/         Sub-domain — see src/features/CLAUDE.md
```

Routing is file-based via `@tanstack/router-plugin/vite`'s `virtualRouteConfig` (`apps/app/vite.config.ts`), not directory-mounted: `routes.ts` declares the tree once so the vertical-slice layout (`features/<x>/<x>.route.tsx`) stays intact instead of being flattened into a `src/routes/` directory. `autoCodeSplitting: true` — each route file's component chunks on its own as long as it stays unexported (see `src/features/CLAUDE.md`).

## Import direction

`routes.ts` → `features/` → `shared/`. No cross-feature imports between route-owning features. No barrels.

- `routes.ts` → `router/*.tsx`, `features/<x>/<x>.route.tsx`
- `router/*.tsx` → `shared/`, `@packages/*` (features import FROM here)
- `features/<x>/` (route-owning) → `router/*.tsx`, `shared/`, `@packages/*`, `features/<library-feature>/`
- `features/<library-feature>/` → `shared/`, `@packages/*`. Never imports from other features.
- `shared/<sub>/` → `shared/<sibling>/`, `shared/env.ts`, `shared/utils.ts` (no upward imports)

**Placement decisor — the two questions that settle it.** Before writing a component under `features/<x>/`, ask: (1) *is it mounted by the shell or any `shared/` code?* (2) *will a second route-owning feature render it?* Either yes → it belongs in `shared/<domain>/`, not in the feature. **Why**: both answers make the feature location structurally impossible, not merely untidy — `shared/` may never import `features/`, and two route-owning features may never import each other, so the import you would need does not exist. Group it as `shared/<domain>/` (like `auth/`, `notifications/`) once it spans more than a component or two; the feature then keeps only its route and page. A component that is *cross-cutting* is not the same as one that is *reusable*: reusable-and-presentational belongs in `@packages/ui`, cross-cutting-and-app-aware belongs in `shared/`.

## Naming

Files `kebab-case.tsx`; components `PascalCase` named exports; hooks `use-<verb>-<noun>.ts` → `useVerbNoun`; schemas `<feature>.schema.ts` → `<noun>Schema`+`<Noun>Input` (z.infer).

## App-wide rules

1. **`className` is for layout only** — `flex` (default), `w-*`, `h-*`, `mx-auto`, `gap-*`, responsive breakpoints. **`grid` reserved for true 2D**; `flex flex-col gap-*` for any vertical stack. Colors/typography/radius/shadows/look-defining paddings live in **theme** (`@theme` in `globals.css`) or in the primitive itself. Inline `bg-foo text-bar p-3` = theme drift = no design system.
2. **Always shadcn first, stay shadcn-pure** — check `@packages/ui/components/ui/*` and the [shadcn registry](https://ui.shadcn.com/docs/components) before custom. **Use the actual slots** (`Card`+`CardHeader`+`CardTitle`) — wrong slot forces hacks (`pt-6`, `space-y-4`). No wrapper variants, no `data-slot="*"` overrides. Adjustments → theme or primitive. Custom (last resort) lives in `@packages/ui/components/ui/*`, never inline in a feature.
3. **Exactly one `<main>` per rendered page**. `__root.tsx` and pathless gates are passthroughs (`component: Outlet`) — never wrap in landmarks. Each `<feature>.page.tsx` owns its `<header>`/`<main>`/`<footer>`. Same for `<h1>` (one per page).

**Theme & dark mode**: `next-themes` (`attribute="class"`, `defaultTheme="system"`, `disableTransitionOnChange`). Toggle uses View Transitions API with `prefers-reduced-motion` fallback. View-transition CSS in `globals.css`.

**Typography contract**: text via shadcn typography exports (named, not namespace). Custom typography → theme or Typography component. `className` on Typography for layout only.
