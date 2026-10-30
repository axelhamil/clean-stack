import { timingSafeEqual } from "node:crypto";
import { base32 } from "@better-auth/utils/base32";
import { createOTP } from "@better-auth/utils/otp";
import { Option, Result } from "@packages/ddd-kit";
import { and, eq, isNull, or, resolveExecutor, schema } from "@packages/drizzle";
import { type SecretConfig, symmetricDecrypt } from "better-auth/crypto";
import { authSecretKey } from "../auth/auth-secrets";
import { TOTP_OPTIONS } from "../auth/totp-options";
import { dbOperationFailure } from "../db-failure";
import { env } from "../env";
import type { IInstrumentation } from "../ports/instrumentation.port";
import type { ITotpVerifier, TotpVerifierError } from "../ports/totp-verifier.port";

const dbAttrs = { "db.system.name": "postgresql" } as const;
const IMPORTED_SECRET_PREFIX = "base32:";
const CLOCK_DRIFT_STEPS = 1;

const failure = dbOperationFailure("TOTP_VERIFIER_PROVIDER_FAILURE");

async function decryptSecret(
  key: string | SecretConfig,
  encrypted: string,
): Promise<string | Uint8Array> {
  const secret = await symmetricDecrypt({ key, data: encrypted });
  if (!secret.startsWith(IMPORTED_SECRET_PREFIX)) return secret;

  return base32.decode(secret.slice(IMPORTED_SECRET_PREFIX.length).toUpperCase());
}

function sameCode(input: string, expected: string): boolean {
  const left = Buffer.from(input);
  const right = Buffer.from(expected);

  return left.length === right.length && timingSafeEqual(left, right);
}

async function matchedCounter(secret: string | Uint8Array, code: string): Promise<Option<number>> {
  const otp = createOTP(secret, TOTP_OPTIONS);
  const current = Math.floor(Date.now() / (TOTP_OPTIONS.period * 1000));
  let matched = Option.none<number>();

  for (let step = -CLOCK_DRIFT_STEPS; step <= CLOCK_DRIFT_STEPS; step += 1) {
    const counter = current + step;
    if (sameCode(code, await otp.hotp(counter))) matched = Option.some(counter);
  }

  return matched;
}

export class DrizzleTotpVerifier implements ITotpVerifier {
  constructor(
    private readonly instrumentation: IInstrumentation,
    private readonly authSecret: string | SecretConfig = authSecretKey(env),
  ) {}

  async verify(userId: string, code: string): Promise<Result<Option<number>, TotpVerifierError>> {
    const exec = resolveExecutor();

    return this.instrumentation.startSpan({ name: "DrizzleTotpVerifier > verify" }, async () => {
      try {
        const query = exec
          .select({ secret: schema.twoFactor.secret })
          .from(schema.twoFactor)
          .where(
            and(
              eq(schema.twoFactor.userId, userId),
              or(eq(schema.twoFactor.verified, true), isNull(schema.twoFactor.verified)),
            ),
          )
          .limit(1);
        const [row] = await this.instrumentation.startSpan(
          { name: query.toSQL().sql, op: "db.query", attributes: dbAttrs },
          () => query.execute(),
        );
        if (!row?.secret) return Result.ok(Option.none());

        return Result.ok(await this.match(row.secret, code));
      } catch (err) {
        this.instrumentation.capture(err);
        return Result.fail(failure("verify"));
      }
    });
  }

  private async match(encrypted: string, code: string): Promise<Option<number>> {
    try {
      return await matchedCounter(await decryptSecret(this.authSecret, encrypted), code);
    } catch (err) {
      this.instrumentation.capture(err);
      return Option.none();
    }
  }
}
