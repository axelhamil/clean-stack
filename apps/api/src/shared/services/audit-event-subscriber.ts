import type { AuditActorType } from "@packages/drizzle";
import { auditLogSchema, desc, isNotNull, sql, type Transaction } from "@packages/drizzle";
import { retentionFor } from "@packages/events";
import { env } from "../env";
import type { IInstrumentation } from "../ports/instrumentation.port";
import type { OutboxRecord } from "../ports/outbox.port";
import { computeAuditHash, GENESIS_HASH } from "./audit-hash";
import { ACTOR_KEYS, readUserId } from "./event-actor";
import type { OutboxSubscriber } from "./outbox-subscriber";

function extractActor(event: OutboxRecord): { id: string | null; type: AuditActorType } {
  const actorId = readUserId(event.payload, ACTOR_KEYS);
  if (actorId.isNone()) return { id: null, type: "system" };

  return { id: actorId.unwrap(), type: "user" };
}

export class AuditEventSubscriber implements OutboxSubscriber {
  readonly name = "audit";

  constructor(private readonly instrumentation: IInstrumentation) {}

  async handle(event: OutboxRecord, tx: Transaction): Promise<void> {
    return this.instrumentation.startSpan({ name: "AuditEventSubscriber > handle" }, async () => {
      try {
        const retention = retentionFor(event.eventType);
        if (retention === "none") return;

        const actor = extractActor(event);
        const al = auditLogSchema.auditLog;
        const entry = {
          id: `audit-${event.id}`,
          action: event.eventType,
          actorId: actor.id,
          actorType: actor.type,
          organizationId: event.organizationId.toNull(),
          targetType: event.aggregateType,
          targetId: event.aggregateId,
          requestId: event.metadata.requestId ?? null,
          retention,
        };

        let prevHash: string | null = null;
        let hash: string | null = null;
        if (env.AUDIT_TAMPER_EVIDENCE) {
          await tx.execute(sql`select pg_advisory_xact_lock(hashtext('audit_log_chain'))`);
          const last = await tx
            .select({ hash: al.hash })
            .from(al)
            .where(isNotNull(al.hash))
            .orderBy(desc(al.sequence))
            .limit(1)
            .execute();
          prevHash = last[0]?.hash ?? GENESIS_HASH;
          hash = computeAuditHash({
            ...entry,
            metadata: event.payload,
            occurredAt: event.occurredAt.toISOString(),
            prevHash,
          });
        }

        const query = tx
          .insert(al)
          .values({
            ...entry,
            metadata: event.payload as Record<string, unknown>,
            occurredAt: event.occurredAt,
            prevHash,
            hash,
          })
          .onConflictDoNothing({ target: al.id });
        await this.instrumentation.startSpan(
          {
            name: query.toSQL().sql,
            op: "db.query",
            attributes: { "db.system.name": "postgresql" },
          },
          () => query.execute(),
        );
      } catch (err) {
        this.instrumentation.capture(err);
        throw err;
      }
    });
  }
}
