import { z } from "zod";

const envSchema = z.object({
  VITE_API_URL: z.url().default("http://localhost:3000"),
  VITE_SENTRY_DSN: z.preprocess((v) => (v === "" ? undefined : v), z.url().optional()),
  VITE_SENTRY_ENVIRONMENT: z.string().optional(),
  VITE_GIT_SHA: z.string().optional(),
  VITE_ANALYTICS_SRC: z.preprocess((v) => (v === "" ? undefined : v), z.url().optional()),
});

export const env = envSchema.parse(import.meta.env);
