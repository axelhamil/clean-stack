import { rolesWithStaffPermission } from "@packages/access-control";
import {
  and,
  authSchema,
  eq,
  gt,
  inArray,
  isNull,
  not,
  or,
  type SQL,
  sql,
  staffSchema,
} from "@packages/drizzle";
import type { StaffEnv } from "../staff-access";
import type { AudienceTarget } from "./resolve-audience";

/**
 * Who can use a staff permission now, read the way `staffAccessOf` and `staffReachable` decide it,
 * plus the requester, minus whoever acted and whoever the request is about. A listed id is always
 * a manager and carries no override; an `env` row off the list grants nothing.
 */
export function staffRecipients(
  target: Extract<AudienceTarget, { kind: "staff" }>,
  env: StaffEnv,
): SQL {
  const s = staffSchema.staffMember;
  const o = staffSchema.staffPermissionOverride;
  const u = authSchema.user;
  const excluded = [target.actorUserId.toNull(), target.subjectUserId.toNull()].filter(
    (id) => id !== null,
  );
  const included = (ids: readonly string[]) => ids.filter((id) => !excluded.includes(id));
  const reachable = env.PLATFORM_ADMIN_REQUIRE_MFA ? eq(u.twoFactorEnabled, true) : undefined;
  const liveOverride = (effect: "grant" | "deny") =>
    sql`EXISTS (SELECT 1 FROM ${o} WHERE ${and(
      eq(o.userId, s.userId),
      eq(o.permission, target.permission),
      eq(o.effect, effect),
      isNull(o.revokedAt),
      or(isNull(o.expiresAt), gt(o.expiresAt, new Date())),
    )})`;
  const staffWhere = and(
    isNull(s.revokedAt),
    not(eq(s.source, "env")),
    or(inArray(s.role, rolesWithStaffPermission(target.permission)), liveOverride("grant")),
    sql`NOT ${liveOverride("deny")}`,
    excluded.length === 0 ? undefined : not(inArray(s.userId, excluded)),
    reachable,
  );
  const requester = target.requesterUserId.map((id) => [id]).unwrapOr([]);

  return sql`(SELECT ${s.userId} AS user_id FROM ${s} INNER JOIN ${u} ON ${eq(u.id, s.userId)} WHERE ${staffWhere}
    UNION SELECT ${u.id} FROM ${u} WHERE ${and(inArray(u.id, included(env.PLATFORM_ADMIN_IDS)), reachable)}
    UNION SELECT ${u.id} FROM ${u} WHERE ${and(inArray(u.id, included(requester)), isNull(u.deletedAt))})`;
}
