import { z } from "zod";
import { eventTypesSchema } from "./_event-types";

export const updateEndpointBodySchema = z
  .object({
    url: z.url().optional(),
    eventTypes: eventTypesSchema.optional(),
    enabled: z.boolean().optional(),
  })
  .refine((v) => v.url !== undefined || v.eventTypes !== undefined || v.enabled !== undefined, {
    message: "At least one field must be provided",
  });
