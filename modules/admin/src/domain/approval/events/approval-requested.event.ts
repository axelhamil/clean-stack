import type { IDomainEvent } from "@packages/ddd-kit";
import { type AdminApprovalRequestedPayload, EventTypes } from "@packages/events";
import type { z } from "zod";
import { approvalEvent } from "../approval-ref";

export type ApprovalRequested = z.infer<typeof AdminApprovalRequestedPayload>;

export function approvalRequestedEvent(
  payload: ApprovalRequested,
  dateOccurred: Date,
): IDomainEvent<ApprovalRequested> {
  return approvalEvent(EventTypes.ADMIN_APPROVAL_REQUESTED, payload, dateOccurred);
}
