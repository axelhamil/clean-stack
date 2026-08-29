import { isSubscribableSelector } from "@packages/events";
import { z } from "zod";

export const webhookFormSchema = z.object({
  url: z.url(),
  eventTypes: z
    .array(z.string())
    .min(1)
    .refine((arr) => arr.every(isSubscribableSelector), {
      params: { i18nKey: "validation.invalidEventSelection" },
    }),
  enabled: z.boolean(),
});

export type WebhookFormInput = z.infer<typeof webhookFormSchema>;
