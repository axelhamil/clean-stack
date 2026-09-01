import { z } from "zod";

/**
 * Public projection of the `user` row for `/api/v1`.
 *
 * Why parse instead of hand-picking fields: `zod` strips unknown keys, so a
 * column added to the `user` table later cannot reach a token consumer without
 * someone explicitly adding it here. Hand-picking re-opens the leak on every
 * schema change; the whitelist has to be structural.
 *
 * Excluded on purpose: moderation state (`role`, `banned`, `banReason`,
 * `banExpires`), billing (`stripeCustomerId`), RGPD lifecycle
 * (`pendingDeletionUntil`, `deletedAt`, `lastExportRequestedAt`), in-flight
 * changes (`pendingEmail`), security capabilities (`twoFactorEnabled`) and the
 * middleware-computed `isPlatformAdmin`, which would expose the platform's
 * admin allowlist.
 */
const publicUserSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string(),
  emailVerified: z.boolean(),
  image: z.string().nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export const meResponseSchema = z.object({ user: publicUserSchema });
