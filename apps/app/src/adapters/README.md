# adapters/

Infrastructure-as-implementation. One file per concern.

Mirrors `apps/api/src/adapters/`: this is where the app talks to the outside world.

Examples:

- `api-client.ts` — Hono RPC client (`hc<AppType>`), end-to-end typed against `apps/api`
- `query-client.ts` — TanStack Query client (singleton)
- `storage.ts` — `localStorage` / `sessionStorage` wrappers
- `analytics.ts` — analytics provider client

May import from: `common/`.
Must NOT import from: `features/`, `routes/`, `providers/`.
