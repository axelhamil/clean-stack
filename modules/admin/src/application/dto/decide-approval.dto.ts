import { z } from "zod";

export const decideApprovalBodySchema = z.object({
  decision: z.enum(["approve", "reject"]),
  note: z.string().trim().min(1).max(500),
});
