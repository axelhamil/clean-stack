import type { Option } from "@packages/ddd-kit";

export interface RecordAuditEntryInput {
  eventId: string;
  eventType: string;
  aggregateType: string;
  aggregateId: string;
  organizationId: Option<string>;
  requestId: Option<string>;
  payload: unknown;
  occurredAt: Date;
}
