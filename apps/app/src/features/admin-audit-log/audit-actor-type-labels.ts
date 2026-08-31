import type { AuditRow } from "./api/audit-log.queries";

/**
 * `AuditRow["actorType"]` is inferred straight from the Hono RPC response
 * type, and it stays the closed `"admin" | "system" | "user"` union declared
 * server-side (`AUDIT_ACTOR_TYPES` in `packages/drizzle/src/schema/audit-log.ts`)
 * — unlike a value the API widens to `string` (e.g. `AdminOrgMemberRow.role`),
 * this one never needs a runtime guard: indexing the lookup below by
 * `row.actorType` is already proven exhaustive by the compiler, matching the
 * `DeviceKind`/`DEVICE_KEYS` pattern in `features/security/components/sessions-card.tsx`.
 *
 * `satisfies Record<AuditActorType, string>` only proves every actor type has
 * AN entry — it cannot catch a swapped pair (e.g. `admin` reading
 * `auditLog.actorType.user`), which is why
 * `__tests__/audit-actor-type-labels.test.ts` asserts the mapping directly.
 *
 * This is a distinct concept from `common.roles` / `shared/auth/role-labels.ts`
 * (an organization membership role): an audit row's actor type classifies who
 * performed the action at the platform level, not what role they hold inside
 * an organization — so it gets its own catalog entries rather than reusing
 * `common.roles.admin`.
 */
export type AuditActorType = AuditRow["actorType"];

export const AUDIT_ACTOR_TYPE_LABEL_KEYS = {
  user: "auditLog.actorType.user",
  system: "auditLog.actorType.system",
  admin: "auditLog.actorType.admin",
} as const satisfies Record<AuditActorType, string>;
