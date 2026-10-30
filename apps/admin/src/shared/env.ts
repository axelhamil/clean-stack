import { blankAsAbsent } from "@packages/web-kit/env/blank-as-absent";
import { z } from "zod";

const envSchema = z.object({
  VITE_API_URL: z.url().default("http://localhost:3000"),
  VITE_APP_URL: z.url().default("http://localhost:5173"),
  VITE_SENTRY_DSN: blankAsAbsent(z.url()),
  VITE_SENTRY_ENVIRONMENT: blankAsAbsent(z.string()),
  VITE_GIT_SHA: blankAsAbsent(z.string()),
});

export const env = envSchema.parse(import.meta.env);
