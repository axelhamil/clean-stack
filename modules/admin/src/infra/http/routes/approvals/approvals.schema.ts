import { timeIdCursorSchema } from "@packages/http/time-id-cursor";
import { z } from "zod";
import { APPROVAL_STATUSES } from "../../../../domain/approval/value-objects/approval-status.vo";

export const listApprovalsQuerySchema = z.object({
  status: z.enum(APPROVAL_STATUSES).optional(),
  cursor: timeIdCursorSchema.optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export const decideApprovalBodySchema = z.object({
  decision: z.enum(["approve", "reject"]),
  note: z.string().trim().min(1).max(500),
});
