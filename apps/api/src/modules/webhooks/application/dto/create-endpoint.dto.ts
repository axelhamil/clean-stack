import { isSubscribableSelector } from "@packages/events";
import { z } from "zod";

export const createEndpointBodySchema = z.object({
  url: z.url(),
  eventTypes: z
    .array(z.string())
    .min(1)
    .refine((arr) => arr.every(isSubscribableSelector), {
      message: "eventTypes contains unknown or non-subscribable selectors",
    }),
  enabled: z.boolean().default(true),
});
