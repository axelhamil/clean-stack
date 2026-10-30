import { timingSafeEqual } from "node:crypto";
import { base32 } from "@better-auth/utils/base32";
import { createOTP } from "@better-auth/utils/otp";
import { Option, Result } from "@packages/ddd-kit";
import { and, eq, isNull, lt, or, resolveExecutor, schema, staffSchema } from "@packages/drizzle";
import { type SecretConfig, symmetricDecrypt } from "better-auth/crypto";
import { TOTP_OPTIONS } from "../auth/totp-options";
import { dbOperationFailure } from "../db-failure";
import type { IInstrumentation } from "../ports/instrumentation.port";
import type { ITotpVerifier, TotpOutcome, TotpVerifierError } from "../ports/totp-verifier.port";

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
    private readonly authSecret: string | SecretConfig,
  ) {}

  async consume(userId: string, code: string): Promise<Result<TotpOutcome, TotpVerifierError>> {
    const exec = resolveExecutor();

    return this.instrumentation.startSpan({ name: "DrizzleTotpVerifier > consume" }, async () => {
      try {
        const [row] = await exec
          .select({ secret: schema.twoFactor.secret })
          .from(schema.twoFactor)
          .where(
            and(
              eq(schema.twoFactor.userId, userId),
              or(eq(schema.twoFactor.verified, true), isNull(schema.twoFactor.verified)),
            ),
          )
          .limit(1);
        if (!row?.secret) return Result.ok("not_enrolled");

        const matched = await this.match(row.secret, code);
        if (matched.isNone()) return Result.ok("invalid");

        const { adminTotpCounter } = staffSchema;
        const counter = matched.unwrap();
        const written = await exec
          .insert(adminTotpCounter)
          .values({ userId, lastCounter: counter })
          .onConflictDoUpdate({
            target: adminTotpCounter.userId,
            set: { lastCounter: counter },
            where: lt(adminTotpCounter.lastCounter, counter),
          })
          .returning({ userId: adminTotpCounter.userId });

        return Result.ok(written.length > 0 ? "accepted" : "replayed");
      } catch (err) {
        this.instrumentation.capture(err);
        return Result.fail(failure("consume"));
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
