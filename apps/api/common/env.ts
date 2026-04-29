import { z } from "zod";

declare const process: { env: Record<string, string | undefined> };

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  PORT: z.coerce.number().default(3000),
  DATABASE_URL: z.url(),
  CORS_ORIGIN: z
    .string()
    .default("http://localhost:5173")
    .transform((v) => v.split(",").map((s) => s.trim())),
  BETTER_AUTH_URL: z.url(),
  BETTER_AUTH_SECRET: z.string().min(32),
  APP_URL: z.url().default("http://localhost:5173"),
  RESEND_API_KEY: z.string().min(1).optional(),
  RESEND_FROM: z.string().default("onboarding@resend.dev"),
  RESEND_TPL_VERIFY_EMAIL: z.string().min(1).optional(),
  RESEND_TPL_RESET_PASSWORD: z.string().min(1).optional(),
  RESEND_TPL_MAGIC_LINK: z.string().min(1).optional(),
  RESEND_TPL_ORG_INVITATION: z.string().min(1).optional(),
  S3_ENDPOINT: z.url().default("http://localhost:9000"),
  S3_REGION: z.string().default("auto"),
  S3_BUCKET: z.string().default("clean-stack"),
  S3_ACCESS_KEY: z.string().default("minioadmin"),
  S3_SECRET_KEY: z.string().default("minioadmin"),
  S3_FORCE_PATH_STYLE: z
    .string()
    .default("true")
    .transform((v) => v === "true"),
  S3_PUBLIC_URL: z.url().default("http://localhost:9000/clean-stack"),
  STORAGE_MAX_UPLOAD_BYTES: z.coerce
    .number()
    .int()
    .positive()
    .default(50 * 1024 * 1024),
  STORAGE_PRESIGN_TTL_MIN_SECONDS: z.coerce.number().int().positive().default(60),
  STORAGE_PRESIGN_TTL_MAX_SECONDS: z.coerce.number().int().positive().default(3600),
});

export const env = envSchema.parse(process.env);
