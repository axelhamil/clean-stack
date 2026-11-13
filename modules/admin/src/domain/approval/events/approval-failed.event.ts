import type { IDomainEvent } from "@packages/ddd-kit";
import { type AdminApprovalFailedPayload, EventTypes } from "@packages/events";
import type { z } from "zod";
import { approvalEvent } from "../approval-ref";

export type ApprovalFailed = z.infer<typeof AdminApprovalFailedPayload>;

export function approvalFailedEvent(
  payload: ApprovalFailed,
  dateOccurred: Date,
): IDomainEvent<ApprovalFailed> {
  return approvalEvent(EventTypes.ADMIN_APPROVAL_FAILED, payload, dateOccurred);
}
