import type { AuditEntry } from "../ports/repositories/audit-log.port";
import type { AuditHashInput } from "../ports/services/audit-hasher.port";

export function toAuditHashInput(entry: AuditEntry, prevHash: string): AuditHashInput {
  return {
    id: entry.id,
    action: entry.action,
    actorId: entry.actorId.toNull(),
    actorType: entry.actorType,
    organizationId: entry.organizationId.toNull(),
    targetType: entry.targetType,
    targetId: entry.targetId,
    metadata: entry.metadata,
    occurredAt: entry.occurredAt.toISOString(),
    requestId: entry.requestId.toNull(),
    retention: entry.retention,
    prevHash,
  };
}
