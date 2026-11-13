import { Option } from "@packages/ddd-kit";
import type * as auditLogSchema from "../../../../schemas/audit-log";
import type { AuditRecord } from "../../../application/ports/repositories/audit-log.port";

type AuditLogRow = typeof auditLogSchema.auditLog.$inferSelect;
type AuditLogInsert = typeof auditLogSchema.auditLog.$inferInsert;

export function toAuditRecord(row: AuditLogRow): AuditRecord {
  return {
    id: row.id,
    action: row.action,
    actorId: Option.fromNullable(row.actorId),
    actorType: row.actorType,
    organizationId: Option.fromNullable(row.organizationId),
    targetType: row.targetType,
    targetId: row.targetId,
    metadata: row.metadata,
    occurredAt: row.occurredAt,
    requestId: Option.fromNullable(row.requestId),
    retention: row.retention,
    prevHash: Option.fromNullable(row.prevHash),
    hash: Option.fromNullable(row.hash),
  };
}

export function toAuditLogRow(record: AuditRecord): AuditLogInsert {
  return {
    id: record.id,
    action: record.action,
    actorId: record.actorId.toNull(),
    actorType: record.actorType,
    organizationId: record.organizationId.toNull(),
    targetType: record.targetType,
    targetId: record.targetId,
    metadata: record.metadata,
    occurredAt: record.occurredAt,
    requestId: record.requestId.toNull(),
    retention: record.retention,
    prevHash: record.prevHash.toNull(),
    hash: record.hash.toNull(),
  };
}
