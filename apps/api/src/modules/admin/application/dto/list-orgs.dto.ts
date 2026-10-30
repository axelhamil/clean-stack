import { z } from "zod";
import { timeIdCursorSchema } from "../../../../shared/pagination/time-id-cursor";

export const listOrgsQuerySchema = z.object({
  search: z.string().trim().min(1).optional(),
  cursor: timeIdCursorSchema.optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export type ListOrgsInput = z.infer<typeof listOrgsQuerySchema>;
