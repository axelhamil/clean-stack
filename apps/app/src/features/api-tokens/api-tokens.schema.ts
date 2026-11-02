import { z } from "zod";

export const API_SCOPES = ["read:profile", "write:profile", "read:organizations"] as const;

export const tokenFormSchema = z.object({
  name: z.string().min(1).max(100),
  scopes: z.array(z.enum(API_SCOPES)).min(1),
  organizationId: z.string().nullable(),
  expiresInDays: z.number().int().positive().nullable(),
});

export type TokenFormInput = z.infer<typeof tokenFormSchema>;
