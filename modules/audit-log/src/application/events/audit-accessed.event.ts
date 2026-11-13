import { EventTypes, type SecurityOperatorAuditAccessedPayload } from "@packages/events";
import type { z } from "zod";
import type { AuditFilters } from "../queries/list-audit-events.query";

export interface AuditAccessed {
  actorUserId: string;
  ip: string;
  filters: AuditFilters;
}

export function auditAccessedEvent({ actorUserId, ip, filters }: AuditAccessed) {
  const payload: z.infer<typeof SecurityOperatorAuditAccessedPayload> = {
    actorUserId,
    ip,
    filters: {
      actorId: filters.actorId,
      actionPrefix: filters.actionPrefix,
      organizationId: filters.organizationId,
      occurredFrom: filters.occurredFrom?.toISOString(),
      occurredTo: filters.occurredTo?.toISOString(),
    },
  };

  return {
    type: EventTypes.SECURITY_OPERATOR_AUDIT_ACCESSED,
    aggregateType: "audit_log",
    aggregateId: "platform",
    payload,
  };
}
