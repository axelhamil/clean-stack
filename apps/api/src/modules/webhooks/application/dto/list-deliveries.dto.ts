import { z } from "zod";

export const WEBHOOK_DELIVERY_STATUSES = ["pending", "success", "failed", "dead_letter"] as const;

export const listDeliveriesQuerySchema = z.object({
  status: z.enum(WEBHOOK_DELIVERY_STATUSES).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  cursor: z.string().optional(),
});
