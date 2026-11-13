import type { IDomainEvent } from "@packages/ddd-kit";
import { type AdminApprovalExecutedPayload, EventTypes } from "@packages/events";
import type { z } from "zod";
import { approvalEvent } from "../approval-ref";

export type ApprovalExecuted = z.infer<typeof AdminApprovalExecutedPayload>;

export function approvalExecutedEvent(
  payload: ApprovalExecuted,
  dateOccurred: Date,
): IDomainEvent<ApprovalExecuted> {
  return approvalEvent(EventTypes.ADMIN_APPROVAL_EXECUTED, payload, dateOccurred);
}
