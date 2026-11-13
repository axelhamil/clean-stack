import type { IDomainEvent } from "@packages/ddd-kit";
import { type AdminApprovalCancelledPayload, EventTypes } from "@packages/events";
import type { z } from "zod";
import { approvalEvent } from "../approval-ref";

export type ApprovalCancelled = z.infer<typeof AdminApprovalCancelledPayload>;

export function approvalCancelledEvent(
  payload: ApprovalCancelled,
  dateOccurred: Date,
): IDomainEvent<ApprovalCancelled> {
  return approvalEvent(EventTypes.ADMIN_APPROVAL_CANCELLED, payload, dateOccurred);
}
