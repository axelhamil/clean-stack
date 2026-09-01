import {
  and,
  eq,
  inArray,
  multiTenantSchema,
  notificationSchema,
  type SQL,
  sql,
  type Transaction,
} from "@packages/drizzle";
import { type NotificationChannel, notificationConfigOf } from "@packages/events";
import type { IInstrumentation } from "../ports/instrumentation.port";
import type { OutboxRecord } from "../ports/outbox.port";
import { DEFAULT_DIGEST_HOUR_UTC, digestDueAt } from "./digest-schedule";
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

/**
 * Org-locked value wins, then the user's own, then the org's unlocked default,
 * then the fallback — the same precedence for whichever preference column is
 * being resolved, so `enabled` and `frequency` can never drift apart.
 */
const resolve = (orgAlias: string, userAlias: string, columnName: string, fallback: SQL) =>
  sql`COALESCE(
    CASE WHEN ${column(orgAlias, p.locked.name)} THEN ${column(orgAlias, columnName)} END,
    ${column(userAlias, columnName)},
    ${column(orgAlias, columnName)},
    ${fallback}
  )`;

function deliveryRules(category: string, organizationId: string | null, forced: boolean) {
  // A forced notification joins no preference row at all, so there is nothing to
  // read a frequency from — and nothing that may defer it. Every forced event in
  // the catalogue is one the recipient must see while it still matters (password
  // changed, MFA toggled, passkey added, deletion requested, payment failed):
  // holding those back until tomorrow's digest turns a security alert into a
  // post-mortem. `'immediate'` here is a literal, not a default that a preference
  // could override.
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

/**
 * The instant the row becomes eligible for a digest e-mail, branching on the
 * frequency the join resolved — or the instant it occurred, when there is no
 * join to branch on (`frequency: null`, i.e. a forced notification).
 *
 * The candidate timestamps are computed in TypeScript and bound as parameters;
 * only the choice between them happens in SQL. The alternative — `date_trunc`
 * arithmetic inside the statement — would put the window rule in the one place
 * no unit test can reach.
 */
function emailDueAt(occurredAt: Date, frequency: SQL | null, anchorHourUtc: number) {
  const at = (f: "immediate" | "hourly" | "daily") =>
    digestDueAt(occurredAt, f, anchorHourUtc).toISOString();
  if (frequency === null) return sql`${at("immediate")}::timestamp`;
  return sql`CASE ${frequency}
              WHEN 'hourly' THEN ${at("hourly")}::timestamp
              WHEN 'daily' THEN ${at("daily")}::timestamp
              ELSE ${at("immediate")}::timestamp
            END`;
}

export class NotificationFanoutSubscriber implements OutboxSubscriber {
  readonly name = "notification-fanout";

  constructor(
    private readonly instrumentation: IInstrumentation,
    private readonly digestHourUtc: number = DEFAULT_DIGEST_HOUR_UTC,
  ) {}

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
              CASE WHEN ${rules.email}
                THEN ${emailDueAt(event.occurredAt, rules.frequency, this.digestHourUtc)}
              END
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
