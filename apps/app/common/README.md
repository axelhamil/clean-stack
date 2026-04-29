# common/

Zero-business infrastructure. Mirrors `apps/api/common/`.

Examples:

- `env.ts` — Zod-validated `import.meta.env` (Vite env vars, prefixed `VITE_`)
- `format.ts` — date/number formatting helpers
- `i18n.ts` — locale wiring

Lives **outside** `src/` (sibling to `src/`) to mirror `apps/api/common/` exactly. Both apps consume their own `common/` via relative imports.

Must NOT import from: `src/features/`, `src/adapters/`, `src/providers/`, `src/routes/`.
