import { z } from "zod";
import { eventTypesSchema } from "./_event-types";

export const createEndpointBodySchema = z.object({
  url: z.url(),
  eventTypes: eventTypesSchema,
  enabled: z.boolean().default(true),
});
