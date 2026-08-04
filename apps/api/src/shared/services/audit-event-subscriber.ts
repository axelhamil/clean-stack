import type { AuditActorType } from "@packages/drizzle";
import { auditLogSchema, desc, isNotNull, sql, type Transaction } from "@packages/drizzle";
import { retentionFor } from "@packages/events";
import { env } from "../env";
import type { IInstrumentation } from "../ports/instrumentation.port";
import type { OutboxRecord } from "../ports/outbox.port";
import { type AuditHashInput, computeAuditHash, GENESIS_HASH } from "./audit-hash";
import type { OutboxSubscriber } from "./outbox-subscriber";

function extractActor(event: OutboxRecord): { id: string | null; type: AuditActorType } {
  const p = event.payload as Record<string, unknown> | null | undefined;
  if (p && typeof p.actorUserId === "string") return { id: p.actorUserId, type: "user" };
  if (p && typeof p.inviterUserId === "string") return { id: p.inviterUserId, type: "user" };
  if (p && typeof p.ownerUserId === "string") return { id: p.ownerUserId, type: "user" };
  if (p && typeof p.userId === "string") return { id: p.userId, type: "user" };
  return { id: null, type: "system" };
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

        let prevHash: string | null = null;
        let hash: string | null = null;
        if (env.AUDIT_TAMPER_EVIDENCE) {
          await tx.execute(sql`select pg_advisory_xact_lock(hashtext('audit_log_chain'))`);
          const last = await tx
            .select({ hash: auditLogSchema.auditLog.hash })
            .from(auditLogSchema.auditLog)
            .where(isNotNull(auditLogSchema.auditLog.hash))
            .orderBy(desc(auditLogSchema.auditLog.sequence))
            .limit(1)
            .execute();
          prevHash = last[0]?.hash ?? GENESIS_HASH;
          const hashInput: AuditHashInput = {
            id: `audit-${event.id}`,
            action: event.eventType,
            actorId: actor.id,
            actorType: actor.type,
            organizationId: event.organizationId.toNull(),
            targetType: event.aggregateType,
            targetId: event.aggregateId,
            metadata: event.payload,
            occurredAt: event.occurredAt.toISOString(),
            requestId: event.metadata.requestId ?? null,
            retention,
            prevHash,
          };
          hash = computeAuditHash(hashInput);
        }

        const query = tx
          .insert(auditLogSchema.auditLog)
          .values({
            id: `audit-${event.id}`,
            actorId: actor.id,
            actorType: actor.type,
            organizationId: event.organizationId.toNull(),
            action: event.eventType,
            targetType: event.aggregateType,
            targetId: event.aggregateId,
            metadata: event.payload as Record<string, unknown>,
            requestId: event.metadata.requestId ?? null,
            retention,
            occurredAt: event.occurredAt,
            prevHash,
            hash,
          })
          .onConflictDoNothing({ target: auditLogSchema.auditLog.id });
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
