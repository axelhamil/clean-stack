import {
  and,
  eq,
  inArray,
  multiTenantSchema,
  notificationSchema,
  sql,
  type Transaction,
} from "@packages/drizzle";
import { type NotificationChannel, notificationConfigOf } from "@packages/events";
import type { IInstrumentation } from "../ports/instrumentation.port";
import type { OutboxRecord } from "../ports/outbox.port";
import type { OutboxSubscriber } from "./outbox-subscriber";
import { resolveAudience } from "./resolve-audience";

function dedupKeyFor(event: OutboxRecord, window: "hour" | "day" | undefined): string | null {
  if (!window) return null;
  const iso = event.occurredAt.toISOString();
  const bucket = window === "hour" ? iso.slice(0, 13) : iso.slice(0, 10);
  return `${event.eventType}:${event.aggregateId}:${bucket}`;
}

const p = notificationSchema.notificationPreference;
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

const allows = (orgAlias: string, userAlias: string) =>
  sql`COALESCE(
    CASE WHEN ${column(orgAlias, p.locked.name)} THEN ${column(orgAlias, p.enabled.name)} END,
    ${column(userAlias, p.enabled.name)},
    ${column(orgAlias, p.enabled.name)},
    TRUE
  )`;

function deliveryRules(category: string, organizationId: string | null, forced: boolean) {
  if (forced) return { joins: sql``, inApp: sql`TRUE`, email: sql`TRUE` };

  const joins = sql`
    ${preferenceJoin("up_app", "user", "in_app", category, organizationId)}
    ${preferenceJoin("op_app", "org", "in_app", category, organizationId)}
    ${preferenceJoin("up_mail", "user", "email", category, organizationId)}
    ${preferenceJoin("op_mail", "org", "email", category, organizationId)}`;

  return { joins, inApp: allows("op_app", "up_app"), email: allows("op_mail", "up_mail") };
}

export class NotificationFanoutSubscriber implements OutboxSubscriber {
  readonly name = "notification-fanout";

  constructor(private readonly instrumentation: IInstrumentation) {}

  async handle(event: OutboxRecord, tx: Transaction): Promise<void> {
    return this.instrumentation.startSpan(
      { name: "NotificationFanoutSubscriber > handle" },
      async () => {
        try {
          const config = notificationConfigOf(event.eventType);
          if (!config) return;

          const target = resolveAudience(config.audience, event);
          if (!target) return;

          const n = notificationSchema.notification;
          const m = multiTenantSchema.member;
          const organizationId = event.organizationId.isSome()
            ? event.organizationId.unwrap()
            : null;

          const recipients =
            target.kind === "user"
              ? sql`(SELECT ${target.userId}::text AS user_id)`
              : sql`(SELECT ${m.userId} AS user_id FROM ${m} WHERE ${
                  target.roles === "all"
                    ? eq(m.organizationId, target.organizationId)
                    : and(
                        eq(m.organizationId, target.organizationId),
                        inArray(m.role, target.roles),
                      )
                })`;

          const rules = deliveryRules(config.category, organizationId, config.forced === true);

          const insertSql = sql`
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
              ${config.category},
              ${event.eventType},
              ${config.groupBy ? `${event.eventType}:${event.aggregateId}` : null},
              ${dedupKeyFor(event, config.dedupWindow)},
              ${JSON.stringify(event.payload)}::jsonb,
              CASE WHEN ${rules.email} THEN ${event.occurredAt.toISOString()}::timestamp END
            FROM ${recipients} r
            ${rules.joins}
            WHERE ${rules.inApp}
            ON CONFLICT (
              ${sql.identifier(n.userId.name)},
              ${sql.identifier(n.dedupKey.name)}
            ) WHERE ${sql.identifier(n.dedupKey.name)} IS NOT NULL DO NOTHING
          `;

          const query = tx.execute(insertSql);
          await this.instrumentation.startSpan(
            {
              name: query.getQuery().sql,
              op: "db.query",
              attributes: { "db.system.name": "postgresql" },
            },
            () => query.execute(),
          );
        } catch (err) {
          this.instrumentation.capture(err);
          throw err;
        }
      },
    );
  }
}
