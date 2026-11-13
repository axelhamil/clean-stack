import type { IDomainEvent } from "@packages/ddd-kit";
import { type AdminApprovalExpiredPayload, EventTypes } from "@packages/events";
import type { z } from "zod";
import { approvalEvent } from "../approval-ref";

export type ApprovalExpired = z.infer<typeof AdminApprovalExpiredPayload>;

export function approvalExpiredEvent(
  payload: ApprovalExpired,
  dateOccurred: Date,
): IDomainEvent<ApprovalExpired> {
  return approvalEvent(EventTypes.ADMIN_APPROVAL_EXPIRED, payload, dateOccurred);
}
