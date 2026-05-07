import { isKnownEventType } from "@packages/events";
import { z } from "zod";

export const createEndpointBodySchema = z.object({
  url: z.string().url(),
  eventTypes: z
    .array(z.string())
    .min(1)
    .refine((arr) => arr.every(isKnownEventType), {
      message: "eventTypes contains unknown event types",
    }),
  enabled: z.boolean().default(true),
});
