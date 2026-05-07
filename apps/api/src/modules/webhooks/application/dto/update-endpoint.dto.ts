import { isKnownEventType } from "@packages/events";
import { z } from "zod";

export const updateEndpointBodySchema = z
  .object({
    url: z.string().url().optional(),
    eventTypes: z
      .array(z.string())
      .min(1)
      .refine((arr) => arr.every(isKnownEventType), {
        message: "eventTypes contains unknown event types",
      })
      .optional(),
    enabled: z.boolean().optional(),
  })
  .refine((v) => v.url !== undefined || v.eventTypes !== undefined || v.enabled !== undefined, {
    message: "At least one field must be provided",
  });
