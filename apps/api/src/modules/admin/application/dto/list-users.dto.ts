import { z } from "zod";
import { timeIdCursorSchema } from "../../../../shared/pagination/time-id-cursor";

export const listUsersQuerySchema = z.object({
  search: z.string().trim().min(1).optional(),
  banned: z
    .enum(["true", "false"])
    .transform((value) => value === "true")
    .optional(),
  organizationId: z.string().optional(),
  cursor: timeIdCursorSchema.optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export type ListUsersInput = z.infer<typeof listUsersQuerySchema>;
