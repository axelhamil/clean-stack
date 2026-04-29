# common/

Zero-business infrastructure shared across the app — both runtime helpers and app-wide UI primitives.

Anatomy:

- `env.ts` — Zod-validated `import.meta.env` (Vite env vars, prefixed `VITE_`)
- `format.ts` — date / number / currency helpers (when needed)
- `ui/` — generic, app-wide UI primitives that aren't tied to a feature
  - `ui/theme-toggle.tsx` — `next-themes` switch with View Transitions API circle reveal

Conceptually mirrors `apps/api/common/` (which lives outside `src/` because the api has no React). On the app side everything lives under `src/` — there is **only one `common/` folder** in `apps/app/`.

May import from: `@packages/ui`, `@packages/ddd-kit`.
Must NOT import from: `features/`, `adapters/`, `providers/`, `routes/`.
