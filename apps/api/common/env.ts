import { z } from "zod";

declare const process: { env: Record<string, string | undefined> };

const envSchema = z.object({
  NODE_ENV: z
    .enum(["development", "production", "test"])
    .default("development"),
  PORT: z.coerce.number().default(3000),
  DATABASE_URL: z.url(),
  CORS_ORIGIN: z
    .string()
    .default("http://localhost:5173")
    .transform((v) => v.split(",").map((s) => s.trim())),
  BETTER_AUTH_URL: z.url(),
  BETTER_AUTH_SECRET: z.string().min(32),
  APP_URL: z.url().default("http://localhost:5173"),
});

export const env = envSchema.parse(process.env);
