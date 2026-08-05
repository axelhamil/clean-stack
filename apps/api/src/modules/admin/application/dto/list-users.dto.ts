import { z } from "zod";

export const listUsersQuerySchema = z.object({
  search: z.string().trim().min(1).optional(),
  role: z.enum(["admin", "user"]).optional(),
  banned: z.coerce.boolean().optional(),
  organizationId: z.string().optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export type ListUsersInput = z.infer<typeof listUsersQuerySchema>;
