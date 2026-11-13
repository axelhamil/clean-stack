import { z } from "zod";
import { tokenScopesSchema } from "../../../../domain/api-token/value-objects/token-scopes.vo";

export const createTokenBodySchema = z.object({
  name: z.string().min(1).max(100),
  scopes: tokenScopesSchema,
  organizationId: z.string().nullable().default(null),
  expiresInDays: z.number().int().positive().nullable().default(null),
});
