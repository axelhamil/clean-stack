import { authSchema, db } from "@packages/drizzle";
import { signedInternalRequest as signWith } from "@packages/test/check-harness";
import { symmetricEncrypt } from "better-auth/crypto";
import type { Hono } from "hono";
import { authSecretKey } from "../src/auth/auth-secrets";
import { env } from "../src/shared/env";

export async function seedTwoFactor(
  userId: string,
  secret: string,
  verified: boolean,
): Promise<void> {
  await db.insert(authSchema.twoFactor).values({
    id: `${userId}-two-factor`,
    userId,
    secret: await symmetricEncrypt({ key: authSecretKey(env), data: secret }),
    backupCodes: "[]",
    verified,
  });
}

export async function signedInternalRequest(
  app: Hono,
  path: string,
  body: unknown,
): Promise<Response> {
  const key = env.INTERNAL_SIGNING_KEY;
  if (!key) throw new Error("INTERNAL_SIGNING_KEY is not set, cannot sign a request");

  return signWith(app, path, body, key);
}
