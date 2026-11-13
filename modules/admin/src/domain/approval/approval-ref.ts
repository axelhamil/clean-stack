import { type IDomainEvent, uuidv7 } from "@packages/ddd-kit";
import type { EventType } from "@packages/events";

export interface ApprovalRef {
  approvalId: string;
  action: string;
  requesterUserId: string;
  userId: string;
}

export function approvalEvent<T extends ApprovalRef>(
  eventType: EventType,
  payload: T,
  dateOccurred: Date,
): IDomainEvent<T> {
  return {
    eventId: uuidv7(),
    eventType,
    dateOccurred,
    aggregateId: payload.approvalId,
    aggregateType: "admin_approval",
    payload,
  };
}
