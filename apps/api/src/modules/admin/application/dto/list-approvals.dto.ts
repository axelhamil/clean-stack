import { z } from "zod";
import { APPROVAL_STATUSES } from "../ports/approval-store.port";

export const listApprovalsQuerySchema = z.object({
  status: z.enum(APPROVAL_STATUSES).optional(),
  cursor: z.iso.datetime().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export type ListApprovalsInput = z.infer<typeof listApprovalsQuerySchema>;
