import { z } from "zod";

export const listAuditEventsQuerySchema = z.object({
  actorId: z.string().optional(),
  organizationId: z.string().optional(),
  targetType: z.string().optional(),
  targetId: z.string().optional(),
  actionPrefix: z.string().optional(),
  occurredFrom: z
    .string()
    .datetime()
    .transform((s) => new Date(s))
    .optional(),
  occurredTo: z
    .string()
    .datetime()
    .transform((s) => new Date(s))
    .optional(),
  limit: z.coerce.number().int().min(1).max(500).default(50),
  cursor: z.string().optional(),
});
