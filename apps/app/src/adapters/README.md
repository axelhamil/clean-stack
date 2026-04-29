# adapters/

Infrastructure-as-implementation. One file per concern.

Mirrors `apps/api/src/adapters/`: this is where the app talks to the outside world.

Currently shipped:

- `api-client.ts` — Hono RPC client (`hc<AppType>`), end-to-end typed against `apps/api`. **The single entry point** to the API — features never call `fetch` directly.
- `auth-client.ts` — BetterAuth React client (passkeys, 2FA, magic-link plugins).
- `auth-broadcast.ts` — `BroadcastChannel('clean-stack-auth')` wrapper for cross-tab session sync.
- `query-client.ts` — TanStack Query client (singleton).
- `queries/<noun>.ts` — `queryOptions` factories (e.g. `sessionQueryOptions`, `passkeysQueryOptions`) shared by `beforeLoad` gates and components.
- `mutations/<verb>.ts` — `mutationOptions` factories (e.g. `createUploadMutationOptions` — three-step R2/MinIO `presign` → direct `PUT` → `confirm`). Consumed via `useMutation({ ...xxxMutationOptions, onSuccess, onError })`. The call site owns side-effects; the factory only does the network work. See `CLAUDE.md` → "mutationOptions cookbook".

May import from: `common/`.
Must NOT import from: `features/`, `routes/`, `providers/`.
