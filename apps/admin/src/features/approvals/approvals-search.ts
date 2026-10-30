import { z } from "zod";

export const APPROVAL_STATUSES = [
  "pending",
  "approved",
  "rejected",
  "cancelled",
  "expired",
  "executed",
  "failed",
] as const;

export type ApprovalStatus = (typeof APPROVAL_STATUSES)[number];

export const approvalsSearchSchema = z.object({
  status: z.enum(APPROVAL_STATUSES).optional().catch(undefined),
});
