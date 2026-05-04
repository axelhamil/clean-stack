# Shared (front)

Loaded when working inside `apps/app/src/shared/`. Auth client, API client, route gates, authorization, org-scoping front. App-wide rules in `apps/app/CLAUDE.md`.

## What lives here

- `api/` — api-client, query-client, queries/, mutations/, errors/
- `auth/` — auth-client, auth-broadcast, can, use-authorization, use-set-active-org, use-sign-out, schemas/
- `components/` — cross-feature UI (app-shell, org-switcher, command-palette, …)
- `app-providers.tsx` — provider tree
- `env.ts` — validated env
- `utils.ts` — pure helpers

## Hono RPC client

Single client lives in `shared/api/api-client.ts`: `hcWithType(baseUrl, { init: { credentials: "include" }, fetch: customFetch })`. Custom fetch injects `X-Request-Id` and is the slot for future global handlers (401 redirect, token refresh, Capacitor Bearer). **`hcWithType` from `api/client`, not inline `hc<AppType>`** — `tsc` resolves `ApiClient` once. **Errors stay `throw on !res.ok`** — `ApplyGlobalResponse` widens response types but no discriminated union.

## Auth (BetterAuth client)

`shared/auth/auth-client.ts`: one `createAuthClient` with same plugin set as server; sessions via TanStack Query, not auth-lib nanostore.

## Route gates (in `router/layouts.tsx` + `router.tsx`)

Auth state enforced by **layout routes with `id` (no path)** — `_guest`, `_protected`, `_shell`, `_org-scope`. Each owns its `beforeLoad`. Children inherit via `addChildren`. The `_` prefix marks "no path contribution". Naming by access *condition*, not feature — avoid `_auth` (ambiguous).

**Single source of session truth — TanStack Query, not React state.** Router context exposes only `queryClient`. Gates' `beforeLoad` reads `ensureQueryData(sessionQueryOptions)` (staleTime aligned with `cookieCache.maxAge`). No `useSession()` React bridge, no race.

**After auth mutations, push state into the query, then navigate.** Sign-in/verify/magic-link/2FA: `await queryClient.refetchQueries({ queryKey: sessionQueryOptions.queryKey })`. Sign-out: `setQueryData(..., null)`. Then `void navigate({ to })`.

**Token-consuming routes stay outside the gates** — attach to `rootRoute` directly. Under `_guest` they'd be 302'd away the moment the token signs the user in. Token effects use `useRef(false)` against StrictMode double-fire.

**Realtime cross-tab sync via `BroadcastChannel`** — `shared/auth/auth-broadcast.ts` (~15 LoC, native, stable since 2017). Mutations call `broadcastAuthChange()`; `app-providers.tsx` listens once and `refetchQueries(['session','active-org','current-membership','orgs'])`+`router.invalidate()`. No payload — cookie shared, each tab refetches live state. Use for **any** auth/org state change.

**Per-route capability gates use `ensureOrgPermission(...)`, not nested pathless layouts.** One pathless `_org-scope` gates "active org required"; capabilities live per-route in `beforeLoad`. **Why**: stacking `_org-admin`/`_org-owner`/`_can-manage-billing` forces every tier into the directory tree. Customize via `ensureOrgPermission(perms, { redirectTo })`.

**Don't static-import the route binding from a page file** (`import { xxxRoute } from "./xxx.route"`) — creates a cycle Biome flags. Pages access route via `getRouteApi("/path/id")`.

## Authorization (capability-based, front)

Defined once in `@packages/access-control` — same `OrgPermissions` shape, same roles as server. Three layers, one predicate:
- **Route gate** `ensureOrgPermission(permissions)` in `beforeLoad`
- **UI** `<Can requires={...} connector?="OR" fallback?={...}>` backed by `useAuthorization().can()`

**Why**: defense in depth — server enforces, gate prevents access, UI hides unreachable controls. Children needing permission-aware behavior call `useAuthorization` themselves rather than receiving `canEdit: boolean` props. Dev-only `<AuthorizationDevTool>` (mounted in `__root.tsx`, tree-shaken in prod) renders live capability matrix.

## Org-scoping (front)

1. **Org-changing mutations broadcast `broadcastAuthChange()` from call-site `onSuccess`** (not the factory): `setActive`, `create-org`, `delete-org`, `leave-org`, `transfer-and-leave`, `accept-invitation`, `remove-member`. **Why**: a tab holds stale `activeOrganizationId` up to `cookieCache.maxAge` (5 min) without a signal.
2. **`getActiveMember`/`getFullOrganization` translate `NO_ACTIVE_ORGANIZATION` to `null` at query layer.** Active-org/membership query options catch the code, return `null`. **Why**: BetterAuth treats "no active org" as error, but in our model it's a valid transient state (between orgs, pre-self-heal). Letting it bubble crashes every `ensureQueryData` consumer.
3. **Navigation declares `requires: OrgPermissions`+`requiresOrg: boolean`, not roles.** Settings tabs and command-palette routes filter via `useAuthorization().can(requires)`+`hasMembership`. New org-scoped sub-route → declare both at nav source AND `ensureOrgPermission(...)` on the route file (same tuple).
4. **Personal org never special-cased except via `isPersonalOrg(slug)`** (`slug = personal-${orgId}`). Front hides Leave/Delete; removal goes via account deletion.
