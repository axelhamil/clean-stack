import { type IInstrumentation, Result } from "@packages/ddd-kit";
import {
  and,
  eq,
  inArray,
  multiTenantSchema,
  resolveExecutor,
  type SQL,
  sql,
} from "@packages/drizzle";
import type { NotificationChannel } from "@packages/events";
import * as notificationSchema from "../../../../schemas/notification";
import type {
  EmailDueAt,
  FanoutRecipients,
  INotificationFanoutRepository,
  NotificationFanout,
  NotificationFanoutError,
} from "../../../application/ports/repositories/notification-fanout.port";
import { preferencePrecedence } from "./preference-precedence";

const dbAttrs = { "db.system.name": "postgresql" } as const;

const n = notificationSchema.notification;
const p = notificationSchema.notificationPreference;
const m = multiTenantSchema.member;

const column = (alias: string, name: string) =>
  sql`${sql.identifier(alias)}.${sql.identifier(name)}`;

function preferenceJoin(
  alias: string,
  scope: "user" | "org",
  channel: NotificationChannel,
  category: string,
  organizationId: string | null,
) {
  const scopeMatch =
    scope === "user"
      ? sql`${column(alias, p.scopeId.name)} = r.user_id`
      : sql`${column(alias, p.scopeId.name)} = ${organizationId}`;

  return sql`
    LEFT JOIN ${p} ${sql.identifier(alias)}
      ON ${column(alias, p.scope.name)} = ${scope}
      AND ${column(alias, p.category.name)} = ${category}
      AND ${column(alias, p.channel.name)} = ${channel}
      AND ${scopeMatch}`;
}

const resolve = (orgAlias: string, userAlias: string, columnName: string, fallback: SQL) =>
  preferencePrecedence(
    { locked: column(orgAlias, p.locked.name), value: column(orgAlias, columnName) },
    column(userAlias, columnName),
    fallback,
  );

function deliveryRules(category: string, organizationId: string | null, forced: boolean) {
  if (forced) {
    return { joins: sql``, inApp: sql`TRUE`, email: sql`TRUE`, frequency: null };
  }

  const joins = sql`
    ${preferenceJoin("up_app", "user", "in_app", category, organizationId)}
    ${preferenceJoin("op_app", "org", "in_app", category, organizationId)}
    ${preferenceJoin("up_mail", "user", "email", category, organizationId)}
    ${preferenceJoin("op_mail", "org", "email", category, organizationId)}`;

  return {
    joins,
    inApp: resolve("op_app", "up_app", p.enabled.name, sql`TRUE`),
    email: resolve("op_mail", "up_mail", p.enabled.name, sql`TRUE`),
    frequency: resolve("op_mail", "up_mail", p.frequency.name, sql`'immediate'`),
  };
}

function emailDueAtOf(dueAt: EmailDueAt, frequency: SQL | null) {
  const at = (f: keyof EmailDueAt) => dueAt[f].toISOString();
  if (frequency === null) return sql`${at("immediate")}::timestamp`;

  return sql`CASE ${frequency}
              WHEN 'hourly' THEN ${at("hourly")}::timestamp
              WHEN 'daily' THEN ${at("daily")}::timestamp
              ELSE ${at("immediate")}::timestamp
            END`;
}

function recipientsOf(recipients: FanoutRecipients): SQL {
  if (recipients.kind === "user") return sql`(SELECT ${recipients.userId}::text AS user_id)`;
  if (recipients.kind === "listed") {
    return sql`(SELECT unnest(${sql.param(recipients.userIds)}::text[]) AS user_id)`;
  }

  return sql`(SELECT ${m.userId} AS user_id FROM ${m} WHERE ${
    recipients.roles === "all"
      ? eq(m.organizationId, recipients.organizationId)
      : and(eq(m.organizationId, recipients.organizationId), inArray(m.role, recipients.roles))
  })`;
}

function insertOf(fanout: NotificationFanout): SQL {
  const organizationId = fanout.organizationId.toNull();
  const rules = deliveryRules(fanout.category, organizationId, fanout.forced);

  return sql`
    INSERT INTO ${n} (
      ${sql.identifier(n.id.name)},
      ${sql.identifier(n.userId.name)},
      ${sql.identifier(n.organizationId.name)},
      ${sql.identifier(n.category.name)},
      ${sql.identifier(n.eventType.name)},
      ${sql.identifier(n.groupKey.name)},
      ${sql.identifier(n.dedupKey.name)},
      ${sql.identifier(n.payload.name)},
      ${sql.identifier(n.emailPendingAt.name)}
    )
    SELECT
      gen_random_uuid()::text,
      r.user_id,
      ${organizationId},
      ${fanout.category},
      ${fanout.eventType},
      ${fanout.groupKey.toNull()},
      ${fanout.dedupKey},
      ${JSON.stringify(fanout.payload)}::jsonb,
      CASE WHEN ${rules.email}
        THEN ${emailDueAtOf(fanout.emailDueAt, rules.frequency)}
      END
    FROM ${recipientsOf(fanout.recipients)} r
    ${rules.joins}
    WHERE ${rules.inApp}
    ON CONFLICT (
      ${sql.identifier(n.userId.name)},
      ${sql.identifier(n.dedupKey.name)}
    ) WHERE ${sql.identifier(n.dedupKey.name)} IS NOT NULL DO NOTHING
  `;
}

const causeOf = (err: unknown) => (err instanceof Error ? err.message : String(err));

export class DrizzleNotificationFanoutRepository implements INotificationFanoutRepository {
  constructor(private readonly instrumentation: IInstrumentation) {}

  async fanOut(fanout: NotificationFanout): Promise<Result<void, NotificationFanoutError>> {
    const exec = resolveExecutor();

    return this.instrumentation.startSpan(
      { name: "DrizzleNotificationFanoutRepository > fanOut" },
      async () => {
        try {
          const query = exec.execute(insertOf(fanout));
          await this.instrumentation.startSpan(
            { name: query.getQuery().sql, op: "db.query", attributes: dbAttrs },
            () => query.execute(),
          );

          return Result.ok();
        } catch (err) {
          this.instrumentation.capture(err);

          return Result.fail({
            code: "NOTIFICATION_FANOUT_PROVIDER_FAILURE",
            message: `database operation failed: fanOut: ${causeOf(err)}`,
          });
        }
      },
    );
  }
}
