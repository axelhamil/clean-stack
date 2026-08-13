import { uuidv7 } from "@packages/ddd-kit";
import {
  and,
  eq,
  inArray,
  multiTenantSchema,
  notificationSchema,
  sql,
  type Transaction,
} from "@packages/drizzle";
import { notificationConfigOf } from "@packages/events";
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
          const shared = {
            organizationId: event.organizationId.isSome() ? event.organizationId.unwrap() : null,
            category: config.category,
            eventType: event.eventType,
            groupKey: config.groupBy ? `${event.eventType}:${event.aggregateId}` : null,
            dedupKey: dedupKeyFor(event, config.dedupWindow),
            payload: event.payload,
            emailPendingAt: event.occurredAt,
          };

          const conflictWhere = sql`${sql.identifier(n.dedupKey.name)} IS NOT NULL`;

          if (target.kind === "user") {
            const insertQuery = tx
              .insert(n)
              .values({ id: uuidv7(), userId: target.userId, ...shared })
              .onConflictDoNothing({ target: [n.userId, n.dedupKey], where: conflictWhere });
            await this.instrumentation.startSpan(
              {
                name: insertQuery.toSQL().sql,
                op: "db.query",
                attributes: { "db.system.name": "postgresql" },
              },
              () => insertQuery.execute(),
            );
            return;
          }

          const m = multiTenantSchema.member;
          const memberFilter =
            target.roles === "all"
              ? eq(m.organizationId, target.organizationId)
              : and(eq(m.organizationId, target.organizationId), inArray(m.role, target.roles));

          const orgInsertSql = sql`
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
              ${m.userId},
              ${shared.organizationId},
              ${shared.category},
              ${shared.eventType},
              ${shared.groupKey},
              ${shared.dedupKey},
              ${JSON.stringify(shared.payload)}::jsonb,
              ${shared.emailPendingAt}
            FROM ${m}
            WHERE ${memberFilter}
            ON CONFLICT (
              ${sql.identifier(n.userId.name)},
              ${sql.identifier(n.dedupKey.name)}
            ) WHERE ${conflictWhere} DO NOTHING
          `;

          const rawQuery = tx.execute(orgInsertSql);
          await this.instrumentation.startSpan(
            {
              name: rawQuery.getQuery().sql,
              op: "db.query",
              attributes: { "db.system.name": "postgresql" },
            },
            () => rawQuery.execute(),
          );
        } catch (err) {
          this.instrumentation.capture(err);
          throw err;
        }
      },
    );
  }
}
