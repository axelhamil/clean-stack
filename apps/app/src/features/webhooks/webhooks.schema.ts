import { isSubscribableSelector } from "@packages/events";
import { z } from "zod";

export const webhookFormSchema = z.object({
  url: z.url({ message: "Enter a valid https URL" }),
  eventTypes: z
    .array(z.string())
    .min(1, { message: "Select at least one event" })
    .refine((arr) => arr.every(isSubscribableSelector), {
      message: "Contains an unknown or non-subscribable event",
    }),
  enabled: z.boolean(),
});

export type WebhookFormInput = z.infer<typeof webhookFormSchema>;
