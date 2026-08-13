import { NOTIFICATION_CATEGORIES } from "@packages/events";
import { z } from "zod";

export const listQuerySchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

export const markReadSchema = z.object({
  ids: z.array(z.string().min(1)).min(1).max(100),
});

export const preferenceSchema = z.object({
  category: z.enum(NOTIFICATION_CATEGORIES),
  channel: z.enum(["in_app", "email"]),
  enabled: z.boolean(),
  frequency: z.enum(["immediate", "hourly", "daily"]).default("immediate"),
});

export const orgPreferenceSchema = preferenceSchema.extend({
  locked: z.boolean().default(false),
});
