import type { AuditFilters } from "../../queries/list-audit-events.query";

export interface ListAuditEventsInput {
  filters: AuditFilters;
  actorUserId: string;
  ip: string;
}
