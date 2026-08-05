import { z } from "zod";

export const setRoleBodySchema = z.object({
  role: z.enum(["admin", "user"]),
});

export type SetRoleInput = z.infer<typeof setRoleBodySchema>;
