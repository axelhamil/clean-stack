import { z } from "zod";

export const API_SCOPES = ["read:profile", "write:profile", "read:organizations"] as const;
export type ApiScope = (typeof API_SCOPES)[number];

export const createTokenBodySchema = z.object({
  name: z.string().min(1).max(100),
  scopes: z.array(z.enum(API_SCOPES)).min(1),
  organizationId: z.string().nullable().default(null),
  expiresInDays: z.number().int().positive().nullable().default(null),
});
export type CreateTokenInput = z.infer<typeof createTokenBodySchema>;
