import { isSubscribableSelector } from "@packages/events";
import { idParamSchema, idSchema } from "@packages/http/id-param";
import { z } from "zod";
import { WEBHOOK_DELIVERY_STATUSES } from "../../../../application/ports/repositories/webhook-delivery.port";

const eventTypesSchema = z
  .array(z.string())
  .min(1)
  .refine((arr) => arr.every(isSubscribableSelector), {
    message: "eventTypes contains unknown or non-subscribable selectors",
  });

export const createEndpointBodySchema = z.object({
  url: z.url(),
  eventTypes: eventTypesSchema,
  enabled: z.boolean().default(true),
});

export const updateEndpointBodySchema = z
  .object({
    url: z.url().optional(),
    eventTypes: eventTypesSchema.optional(),
    enabled: z.boolean().optional(),
  })
  .refine((v) => v.url !== undefined || v.eventTypes !== undefined || v.enabled !== undefined, {
    message: "At least one field must be provided",
  });

export const listDeliveriesQuerySchema = z.object({
  status: z.enum(WEBHOOK_DELIVERY_STATUSES).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  cursor: z.string().optional(),
});

export const deliveryParamSchema = z.intersection(
  idParamSchema,
  z.object({ deliveryId: idSchema }),
);
