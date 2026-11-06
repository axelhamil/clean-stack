import { z } from "zod";
import { DEFAULT_INTERNAL_FETCH_TIMEOUT_MS } from "../shared/internal-routes/internal-fetch";

export const cronEnvSchema = z.object({
  API_URL: z.url(),
  INTERNAL_SIGNING_KEY: z.string().min(32),
  INTERNAL_FETCH_TIMEOUT_MS: z.coerce
    .number()
    .int()
    .min(1000)
    .default(DEFAULT_INTERNAL_FETCH_TIMEOUT_MS),
  SWEEP_HEARTBEAT_URL: z.string().optional(),
});

export type CronEnv = z.infer<typeof cronEnvSchema>;

export function loadCronEnv(): CronEnv {
  return cronEnvSchema.parse(process.env);
}
