import { z } from "zod";

function blankAsAbsent<T extends z.ZodType>(schema: T) {
  return z.preprocess((value) => (value === "" ? undefined : value), schema.optional());
}

const envSchema = z.object({
  VITE_API_URL: z.url().default("http://localhost:3000"),
  VITE_APP_URL: z.url().default("http://localhost:5173"),
  VITE_SENTRY_DSN: blankAsAbsent(z.url()),
  VITE_SENTRY_ENVIRONMENT: blankAsAbsent(z.string()),
  VITE_GIT_SHA: blankAsAbsent(z.string()),
});

export const env = envSchema.parse(import.meta.env);
