# access-control rules

The capability model shared by the server, the route gates and the UI: one statement table, three roles, one predicate. Auto-loaded under `packages/access-control/`. Server gate: `apps/api/CLAUDE.md`; front gates: `apps/app/CLAUDE.md`.

## Layout

`src/staff.ts` holds the platform staff section, re-exported by `index.ts`: `STAFF_ROLES`, `STAFF_PERMISSIONS`, `permissionsOfRole`, `effectivePermissions(role, overrides, now)`, `staffAccessSchema`, `authorizeStaff(access, permission)`, `staffReachable(access)`. `src/index.ts` exports `ac` (the access-control instance), `roles = { owner, admin, member }`, `ORG_ROLES`, `STATEMENTS`, `OrgRole`, `OrgPermissions`, `authorizeRole(role, permissions, connector?)`, `rolesWith(permissions)`, and the personal-org helpers (`isPersonalOrg(slug)`, `PERSONAL_ORG_SLUG_PREFIX`, `PERSONAL_ORG_SLUG_LIKE_PATTERN`).

## Rules

1. **Authorization is capability-based and defined once, here.** A caller describes the capability it needs as an `OrgPermissions` value (`{ billing: ["manage"] }`), never a role name and never a hand-copied resource/action tuple. **Why**: duplicated role and statement tuples between front and back are the most common drift in multi-tenant SaaS.
2. **One predicate, three layers, same shape**: server `requireOrgPermission(permissions)`, route gate `ensureOrgPermission(permissions)` in `beforeLoad`, UI `<Can requires={...}>`. **Why**: defense in depth, the server enforces, the gate prevents navigation, the UI hides unreachable controls.
3. **A new capability is a new statement in `appStatement`, then a grant per role in the role definitions.** The role table in this file is the permission matrix; no other file decides who may do what.
4. **The `as unknown as AccessControl` cast stays inside this package** (`ac`). **Why**: one contained cast beats one per consumer, and callers stay fully typed through `OrgPermissions`.
5. **The personal org is the single allowed special case**, encoded by slug (`personal-${orgId}`) and *checked* only through `isPersonalOrg`. No `isPersonal` flag, no inline `startsWith`. **Why**: the discriminator lives in one place so the rest of the codebase never branches on it.
6. **Server-side events can read capabilities too**: the notification audience `{ can: OrgPermissions }` (in `packages/events`) reuses `OrgPermissions`, so a new capability is available to notifications without another table.

7. **Platform staff is a separate model from org roles, with the same discipline.** A gate or a screen asks for a `StaffPermission`, never a role name, and `effectivePermissions` is the one resolution: an expired override counts for nothing and a deny beats a grant. **Why**: a staff member and an org owner answer different questions, and one table for both would hand tenant roles platform power.

## Commands

`pnpm --filter @packages/access-control test` (vitest). A changed grant gets a test on `authorizeRole` for each affected role.
