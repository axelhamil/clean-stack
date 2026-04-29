import { z } from "zod";

declare const process: { env: Record<string, string | undefined> };

const envSchema = z.object({
  PORT: z.coerce.number().default(3000),
  DATABASE_URL: z.url(),
  CORS_ORIGIN: z
    .string()
    .default("http://localhost:5173")
    .transform((v) => v.split(",").map((s) => s.trim())),
});

export const env = envSchema.parse(process.env);
