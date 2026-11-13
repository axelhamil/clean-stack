import type { IDomainEvent } from "@packages/ddd-kit";
import { type AdminApprovalDecidedPayload, EventTypes } from "@packages/events";
import type { z } from "zod";
import { approvalEvent } from "../approval-ref";

export type ApprovalDecided = z.infer<typeof AdminApprovalDecidedPayload>;

export function approvalDecidedEvent(
  payload: ApprovalDecided,
  dateOccurred: Date,
): IDomainEvent<ApprovalDecided> {
  return approvalEvent(EventTypes.ADMIN_APPROVAL_DECIDED, payload, dateOccurred);
}
