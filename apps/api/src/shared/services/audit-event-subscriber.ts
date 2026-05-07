import type { AuditActorType } from "@packages/drizzle";
import { auditLogSchema, type Transaction } from "@packages/drizzle";
import { retentionFor } from "@packages/events";
import type { OutboxRecord } from "../ports/outbox.port";
import type { OutboxSubscriber } from "./outbox-subscriber";

function extractActor(event: OutboxRecord): { id: string | null; type: AuditActorType } {
  const p = event.payload as Record<string, unknown> | null | undefined;
  if (p && typeof p.userId === "string") return { id: p.userId, type: "user" };
  if (p && typeof p.actorUserId === "string") return { id: p.actorUserId, type: "user" };
  if (p && typeof p.inviterUserId === "string") return { id: p.inviterUserId, type: "user" };
  return { id: null, type: "system" };
}

export class AuditEventSubscriber implements OutboxSubscriber {
  readonly name = "audit";

  async handle(event: OutboxRecord, tx: Transaction): Promise<void> {
    const retention = retentionFor(event.eventType);
    if (retention === "none") return;

    const actor = extractActor(event);
    await tx
      .insert(auditLogSchema.auditLog)
      .values({
        id: `audit-${event.id}`,
        actorId: actor.id,
        actorType: actor.type,
        organizationId: event.organizationId,
        action: event.eventType,
        targetType: event.aggregateType,
        targetId: event.aggregateId,
        metadata: event.payload as Record<string, unknown>,
        requestId: event.metadata.traceparent ?? null,
        retention,
        occurredAt: event.occurredAt,
      })
      .onConflictDoNothing({ target: auditLogSchema.auditLog.id });
  }
}
