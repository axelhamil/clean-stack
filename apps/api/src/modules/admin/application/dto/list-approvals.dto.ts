import { z } from "zod";
import {
  encodeTimeIdCursor,
  timeIdCursorSchema,
} from "../../../../shared/pagination/time-id-cursor";
import { APPROVAL_STATUSES, type ApprovalRecord } from "../ports/approval-store.port";

export const listApprovalsQuerySchema = z.object({
  status: z.enum(APPROVAL_STATUSES).optional(),
  cursor: timeIdCursorSchema.optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export type ListApprovalsInput = z.infer<typeof listApprovalsQuerySchema>;

export function approvalCursorOf(record: Pick<ApprovalRecord, "createdAt" | "id">): string {
  return encodeTimeIdCursor(record.createdAt.toISOString(), record.id);
}
