import * as staffSchema from "@modules/admin/schemas/staff";
import type {
  IStaffRecipientsReader,
  StaffAudienceSettings,
  StaffAudienceTarget,
  StaffRecipientsError,
} from "@modules/notifications/application/ports/staff-recipients.port";
import { rolesWithStaffPermission } from "@packages/access-control";
import { type IInstrumentation, Result } from "@packages/ddd-kit";
import {
  and,
  authSchema,
  dbOperationFailure,
  eq,
  gt,
  inArray,
  isNull,
  not,
  or,
  resolveExecutor,
  type SQL,
  sql,
} from "@packages/drizzle";

const failure = dbOperationFailure("NOTIFICATION_STAFF_RECIPIENTS_PROVIDER_FAILURE");

/**
 * Who can use a staff permission now, read the way `staffAccessOf` and `staffReachable` decide it,
 * plus the requester, minus whoever acted and whoever the request is about. A listed id is always
 * a manager and carries no override; an `env` row off the list grants nothing.
 */
export function staffRecipients(target: StaffAudienceTarget, env: StaffAudienceSettings): SQL {
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

export class StaffRecipientsQuery implements IStaffRecipientsReader {
  constructor(private readonly instrumentation: IInstrumentation) {}

  async recipientsOf(
    target: StaffAudienceTarget,
    settings: StaffAudienceSettings,
  ): Promise<Result<string[], StaffRecipientsError>> {
    const exec = resolveExecutor();

    return this.instrumentation.startSpan(
      { name: "StaffRecipientsQuery > recipientsOf" },
      async () => {
        try {
          const query = exec.execute<{ user_id: string }>(
            sql`SELECT user_id FROM ${staffRecipients(target, settings)} AS r`,
          );
          const { rows } = await this.instrumentation.startSpan(
            {
              name: query.getQuery().sql,
              op: "db.query",
              attributes: { "db.system.name": "postgresql" },
            },
            () => query.execute(),
          );

          return Result.ok(rows.map((row) => row.user_id));
        } catch (err) {
          this.instrumentation.capture(err);
          return Result.fail(failure("recipientsOf"));
        }
      },
    );
  }
}
