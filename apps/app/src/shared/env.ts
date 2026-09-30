import { z } from "zod";

/** `.env.example` ships optional keys as `KEY=`, which Vite reads as "" rather than absent. */
function blankAsAbsent<T extends z.ZodType>(schema: T) {
  return z.preprocess((value) => (value === "" ? undefined : value), schema.optional());
}

const envSchema = z.object({
  VITE_API_URL: z.url().default("http://localhost:3000"),
  VITE_SENTRY_DSN: blankAsAbsent(z.url()),
  VITE_SENTRY_ENVIRONMENT: blankAsAbsent(z.string()),
  VITE_GIT_SHA: blankAsAbsent(z.string()),
  VITE_ANALYTICS_SRC: blankAsAbsent(z.url()),
  VITE_STRIPE_PUBLISHABLE_KEY: blankAsAbsent(z.string()),
});

export const env = envSchema.parse(import.meta.env);
