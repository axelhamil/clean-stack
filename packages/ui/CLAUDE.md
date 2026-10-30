# ui rules

The shadcn component library and the design tokens of the whole product. Auto-loaded under `packages/ui/`. How features consume the primitives (which one to reach for, layout-only `className`): `apps/app/CLAUDE.md`. Cross-cutting rules: `/CLAUDE.md`.

## Layout

```
src/
  components/ui/<name>.tsx   one primitive per file (shadcn and house primitives side by side)
  libs/                      `utils` (`cn`)
  styles/globals.css         the only place tokens live: `:root` / `.dark` variables and `@theme inline`
components.json              shadcn config (style new-york, lucide, neutral base)
```

`exports` map: `./globals.css`, `./components/ui/*`, `./libs/*.js`. Consumers import `@packages/ui/components/ui/<name>`; there is no barrel.

## Rules

1. **Look lives in the theme or the primitive, nowhere else.** Colors, typography, radius, shadows and look-defining padding are tokens in `globals.css` or variants (`cva`) inside the primitive. **Why**: a design change must be one edit; a style hard-coded in a feature is a fork of the design system.
2. **shadcn-pure.** Use the real component and its real slots; do not override `data-slot="*"` from outside, and do not add wrapper variants in a feature. An adjustment is made in the theme or in the primitive itself, and a missing capability becomes a new primitive here, never inline in a feature. Copy a neighbouring primitive's shape (variants through `cva`, `asChild` for composition).
3. **A primitive holds no copy of its own.** Text it renders (a dialog's sr-only close label, a password reveal toggle's name, a cancel button) is a **required prop** the app fills through `t()`, typed so a call site that renders it cannot omit it (`closeLabel` on the dialog is the reference). **Why**: a primitive that shipped an English default would put that literal in every locale's DOM with no diff to catch it.
4. **Typography goes through `typography.tsx`** (named exports: `TypographyH1` with `variant="page"`, `TypographyInline`, ...). A new text style is a variant there, not a class string in a feature.
5. **Page width is `pageContainerVariants({ width })`**: `app` (5xl, default), `prose` (3xl, legal and reference pages), `form` (md, lone-form pages), `wide` (7xl, footer). A new width is a new variant, never a hand-picked `max-w-*` at a call site.
6. **Color tokens are measured, not eyeballed.** Foreground/background pairs must hold WCAG AA contrast (4.5:1 text) in light and dark; the tokens whose value was tuned carry the measurement in a comment in `globals.css`. **Why**: the accessibility gate fails the PR on a `serious` contrast violation, so a token change is verified before it ships.
7. **An interactive primitive ships its keyboard contract**: focus order, trap and restore, Escape. The interaction spec in `apps/app/a11y/` is where it is asserted (`apps/app/CLAUDE.md`, "Accessibility gate").
8. **The package ships source**, like every private package (root rule 4): no build step, `exports` point at `src/`.

## Commands

`pnpm ui:add <component>` (root script, runs `shadcn add` inside this package), then `pnpm --filter @packages/ui ui:fix-imports` (shadcn writes `/src/...` import paths the package cannot resolve) · `pnpm --filter @packages/ui type-check`. Check the shadcn registry before writing a custom primitive.
