import { frontOrigins } from "./env-bounds";
import { envSchema, PRODUCTION_REQUIRED } from "./env-schema";

declare const process: { env: Record<string, string | undefined> };

const rawEnv = Object.fromEntries(
  Object.entries(process.env).map(([k, v]) => [k, v === "" ? undefined : v]),
);

export const env = envSchema.parse(rawEnv);

export const FRONT_ORIGINS = frontOrigins(env);

// Bootstrap ships these as long-enough placeholders so local dev and CI checks
// (check:sweep-lock, check:fanout) work out of the box, but "long enough" also
// satisfies `.min(32)`, so a deploy that copies `.env.example` verbatim and forgets
// to replace them would otherwise boot with a published secret. Reject the literal
// placeholder text, not just its length.
const PLACEHOLDER_SECRETS = new Set([
  "replace-with-openssl-rand-hex-32-chars-minimum",
  "replace-with-openssl-rand-base64-32",
]);

if (env.NODE_ENV === "production") {
  if (env.INTERNAL_SIGNING_KEY && PLACEHOLDER_SECRETS.has(env.INTERNAL_SIGNING_KEY)) {
    throw new Error(
      "INTERNAL_SIGNING_KEY is still the .env.example placeholder. Generate a real one: openssl rand -hex 32",
    );
  }
  if (PLACEHOLDER_SECRETS.has(env.BETTER_AUTH_SECRET)) {
    throw new Error(
      "BETTER_AUTH_SECRET is still the .env.example placeholder. Generate a real one: openssl rand -base64 32",
    );
  }
  if (!env.INTERNAL_AUTH_LAYERS?.includes("signature")) {
    throw new Error(
      'INTERNAL_AUTH_LAYERS must include "signature" in production. Stacking with "private-network" is recommended when schedulers call from the same host or a private mesh.',
    );
  }

  for (const [key, message] of PRODUCTION_REQUIRED) {
    const value = env[key];

    if (value === undefined || (Array.isArray(value) && value.length === 0)) {
      throw new Error(message);
    }
  }
}
