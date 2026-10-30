# web-kit rules

The browser foundation every React app of the monorepo shares: api-client and query-client factories, error classifier and toasts, session query factory, i18n boot, Zod error map, theme, auth broadcast, safe redirects. Auto-loaded under `packages/web-kit/`. How `apps/app` consumes it: `apps/app/CLAUDE.md`.

## Rules

1. **What differs per app arrives as a parameter, the instance lives in the app.** The telemetry sink (`captureError`), the typed api client, the auth client's `getSession`, the broadcast channel name are arguments; `api`, `queryClient`, `sessionQueryOptions` are built in the app. **Why**: a package that imported one app's SDK or client would make the second app inherit it, and swapping the telemetry provider would stop being a one-binding change. `check:boundaries` enforces it (`web-kit-stays-app-agnostic`).
2. **Libraries holding a process-wide singleton are peer dependencies** (`@tanstack/react-query`, `i18next`, `react`, `sonner`, `zod`). **Why**: `z.config`, the `sonner` toaster and the query context only work if the app and the kit resolve one copy.
