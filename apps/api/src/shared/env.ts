import { z } from "zod";

declare const process: { env: Record<string, string | undefined> };

const envSchema = z.object({
  DATABASE_URL: z.url(),
  BETTER_AUTH_URL: z.url(),
  BETTER_AUTH_SECRET: z.string().min(32),

  NODE_ENV: z.enum(["development", "production", "test"]).optional(),
  PORT: z.coerce.number().optional(),
  CORS_ORIGIN: z
    .string()
    .optional()
    .transform((v) => v?.split(",").map((s) => s.trim())),
  APP_URL: z.url().optional(),
  RESEND_API_KEY: z.string().optional(),
  RESEND_FROM: z.string().optional(),
  INTERNAL_SIGNING_KEY: z.string().min(32).optional(),
  INTERNAL_AUTH_LAYERS: z
    .string()
    .optional()
    .transform((v) =>
      v
        ?.split(",")
        .map((s) => s.trim())
        .filter(Boolean),
    )
    .pipe(
      z
        .array(z.enum(["signature", "private-network"]))
        .min(1)
        .optional(),
    ),
  RGPD_GRACE_PERIOD_DAYS: z.coerce.number().int().min(0).optional(),
  RGPD_EXPORT_RATE_LIMIT_HOURS: z.coerce.number().int().positive().optional(),
  RGPD_SWEEP_BATCH_SIZE: z.coerce.number().int().positive().optional(),
  S3_ENDPOINT: z.url().optional(),
  S3_REGION: z.string().optional(),
  S3_BUCKET: z.string().optional(),
  S3_ACCESS_KEY: z.string().optional(),
  S3_SECRET_KEY: z.string().optional(),
  S3_FORCE_PATH_STYLE: z
    .string()
    .optional()
    .transform((v) => v === "true"),
  S3_PUBLIC_URL: z.url().optional(),
  STORAGE_MAX_UPLOAD_BYTES: z.coerce.number().int().positive().optional(),
  STORAGE_PRESIGN_TTL_MIN_SECONDS: z.coerce.number().int().positive().optional(),
  STORAGE_PRESIGN_TTL_MAX_SECONDS: z.coerce.number().int().positive().optional(),
});

const rawEnv = Object.fromEntries(
  Object.entries(process.env).map(([k, v]) => [k, v === "" ? undefined : v]),
);

export const env = envSchema.parse(rawEnv);

if (env.NODE_ENV === "production") {
  if (!env.INTERNAL_AUTH_LAYERS?.includes("signature")) {
    throw new Error(
      'INTERNAL_AUTH_LAYERS must include "signature" in production. Stacking with "private-network" is recommended on Railway/Fly.',
    );
  }
  if (!env.INTERNAL_SIGNING_KEY || env.INTERNAL_SIGNING_KEY.length < 32) {
    throw new Error(
      "INTERNAL_SIGNING_KEY is required in production (min 32 chars). Generate: openssl rand -hex 32",
    );
  }
}
