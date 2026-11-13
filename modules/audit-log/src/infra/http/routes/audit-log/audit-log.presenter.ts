import type { AuditActorType, AuditRetention } from "@packages/events";
import type { AuditRecord } from "../../../../application/ports/repositories/audit-log.port";
import type { AuditPage } from "../../../../application/queries/list-audit-events.query";
import type { ChainVerification } from "../../../../application/queries/verify-audit-chain.query";

type AuditRecordJson = {
  id: string;
  action: string;
  actorId: string | null;
  actorType: AuditActorType;
  organizationId: string | null;
  targetType: string;
  targetId: string;
  metadata: unknown;
  occurredAt: Date;
  requestId?: string;
  retention: AuditRetention;
  prevHash: string | null;
  hash: string | null;
};

function toAuditRecordJson(record: AuditRecord): AuditRecordJson {
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
    ...(record.requestId.isSome() ? { requestId: record.requestId.unwrap() } : {}),
    retention: record.retention,
    prevHash: record.prevHash.toNull(),
    hash: record.hash.toNull(),
  };
}

export function toAuditPageJson(page: AuditPage) {
  return {
    items: page.items.map(toAuditRecordJson),
    nextCursor: page.nextCursor.toNull(),
  };
}

export function toChainVerificationJson(verification: ChainVerification) {
  return {
    verified: verification.verified,
    rowCount: verification.rowCount,
    brokenAtId: verification.brokenAtId.toNull(),
    brokenAtSequence: verification.brokenAtSequence.toNull(),
  };
}
