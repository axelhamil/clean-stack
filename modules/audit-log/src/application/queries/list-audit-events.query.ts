import type { IQuery, Option } from "@packages/ddd-kit";
import type { AuditError, AuditRecord } from "../ports/repositories/audit-log.port";

export type AuditFilters = {
  actorId?: string;
  organizationId?: string;
  targetType?: string;
  targetId?: string;
  actionPrefix?: string;
  occurredFrom?: Date;
  occurredTo?: Date;
  limit?: number;
  cursor?: string;
};

export type AuditPage = {
  items: AuditRecord[];
  nextCursor: Option<string>;
};

export type IListAuditEventsQuery = IQuery<AuditFilters, AuditPage, AuditError>;
