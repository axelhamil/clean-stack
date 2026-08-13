import {
  NOTIFICATION_CATEGORIES,
  NOTIFICATION_CHANNELS,
  NOTIFICATION_FREQUENCIES,
} from "@packages/events";
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
  channel: z.enum(NOTIFICATION_CHANNELS),
  enabled: z.boolean(),
  frequency: z.enum(NOTIFICATION_FREQUENCIES).default("immediate"),
});

export const orgPreferenceSchema = preferenceSchema.extend({
  locked: z.boolean().default(false),
});
