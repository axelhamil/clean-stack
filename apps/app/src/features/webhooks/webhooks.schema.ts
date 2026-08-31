import { isSubscribableSelector } from "@packages/events";
import { z } from "zod";
import { isHttpsUrl } from "../../shared/api/is-https-url";

export const webhookFormSchema = z.object({
  // `z.url()` accepts any scheme, so the https requirement the copy states has
  // to be the check that enforces it.
  url: z.string().refine(isHttpsUrl, { params: { i18nKey: "validation.httpsUrl" } }),
  eventTypes: z
    .array(z.string())
    .min(1)
    .refine((arr) => arr.every(isSubscribableSelector), {
      params: { i18nKey: "validation.invalidEventSelection" },
    }),
  enabled: z.boolean(),
});

export type WebhookFormInput = z.infer<typeof webhookFormSchema>;
