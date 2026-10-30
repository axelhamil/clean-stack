import { z } from "zod";
import { APPROVAL_STATUSES, type ApprovalRecord } from "../ports/approval-store.port";

const CURSOR_SEPARATOR = "~";

const cursorPartsSchema = z.object({ createdAt: z.coerce.date(), id: z.string().min(1) });

const cursorSchema = z.string().transform((raw, ctx) => {
  const [at, id] = raw.split(CURSOR_SEPARATOR);
  const parts = cursorPartsSchema.safeParse({ createdAt: at, id });
  if (parts.success) return parts.data;

  ctx.addIssue({ code: "custom", message: "This cursor was not issued by the approvals list." });

  return z.NEVER;
});

export const listApprovalsQuerySchema = z.object({
  status: z.enum(APPROVAL_STATUSES).optional(),
  cursor: cursorSchema.optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export type ListApprovalsInput = z.infer<typeof listApprovalsQuerySchema>;

export function approvalCursorOf(record: Pick<ApprovalRecord, "createdAt" | "id">): string {
  return `${record.createdAt.toISOString()}${CURSOR_SEPARATOR}${record.id}`;
}
