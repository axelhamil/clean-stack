import { afterEach, describe, expect, it, mock, setSystemTime } from "bun:test";
import { createOTP } from "@better-auth/utils/otp";
import { UnitOfWorkContext } from "@packages/ddd-kit";
import { type SecretConfig, symmetricEncrypt } from "better-auth/crypto";
import { env } from "../../env";
import { DrizzleTotpVerifier } from "../drizzle-totp-verifier";
import { NoOpInstrumentation } from "../noop-instrumentation";

const OTP = { period: 30, digits: 6 } as const;
const NOW = new Date("2026-10-30T12:00:10Z");
const COUNTER = Math.floor(NOW.getTime() / 30_000);

function selectReturning(rows: unknown[], upserted: unknown[] = [{ userId: "u1" }]) {
  return {
    select: () => ({ from: () => ({ where: () => ({ limit: async () => rows }) }) }),
    insert: () => ({
      values: () => ({ onConflictDoUpdate: () => ({ returning: async () => upserted }) }),
    }),
  } as never;
}

async function storedSecret(plain: string) {
  return symmetricEncrypt({ key: env.BETTER_AUTH_SECRET, data: plain });
}

function verify(
  stored: unknown[],
  code: string,
  verifier = new DrizzleTotpVerifier(new NoOpInstrumentation(), env.BETTER_AUTH_SECRET),
  upserted?: unknown[],
) {
  return UnitOfWorkContext.run(selectReturning(stored, upserted), () =>
    verifier.consume("u1", code),
  );
}

afterEach(() => {
  setSystemTime();
});

describe("DrizzleTotpVerifier.consume", () => {
  it("accepts the current and the previous step", async () => {
    setSystemTime(NOW);
    const secret = "generated-two-factor-secret-0123456789";
    const otp = createOTP(secret, OTP);

    const current = await verify([{ secret: await storedSecret(secret) }], await otp.hotp(COUNTER));
    const previous = await verify(
      [{ secret: await storedSecret(secret) }],
      await otp.hotp(COUNTER - 1),
    );

    expect(current.getValue()).toBe("accepted");
    expect(previous.getValue()).toBe("accepted");
  });

  it("answers replayed when the counter did not move", async () => {
    setSystemTime(NOW);
    const secret = "generated-two-factor-secret-0123456789";
    const code = await createOTP(secret, OTP).hotp(COUNTER);

    const result = await verify(
      [{ secret: await storedSecret(secret) }],
      code,
      new DrizzleTotpVerifier(new NoOpInstrumentation(), env.BETTER_AUTH_SECRET),
      [],
    );

    expect(result.getValue()).toBe("replayed");
  });

  it("answers not enrolled without a confirmed secret", async () => {
    expect((await verify([], "123456")).getValue()).toBe("not_enrolled");
  });

  it("refuses a code outside the drift window", async () => {
    setSystemTime(NOW);
    const secret = "generated-two-factor-secret-0123456789";
    const stale = await createOTP(secret, OTP).hotp(COUNTER - 2);

    const result = await verify([{ secret: await storedSecret(secret) }], stale);

    expect(result.getValue()).toBe("invalid");
  });

  it("accepts the current code of a base32 secret imported from another provider", async () => {
    const helloDeadBeef = new Uint8Array([
      0x48, 0x65, 0x6c, 0x6c, 0x6f, 0x21, 0xde, 0xad, 0xbe, 0xef,
    ]);
    const code = await createOTP(helloDeadBeef, OTP).totp();

    const result = await verify([{ secret: await storedSecret("base32:jbswy3dpehpk3pxp") }], code);

    expect(result.getValue()).toBe("accepted");
  });

  it("accepts the code of a secret enrolled before the auth secrets were rotated", async () => {
    const previousKey = "previous-auth-secret-0123456789abcdef";
    const rotatedKey = "rotated-auth-secret-0123456789abcdef0";
    const beforeRotation: SecretConfig = { keys: new Map([[1, previousKey]]), currentVersion: 1 };
    const afterRotation: SecretConfig = {
      keys: new Map([
        [2, rotatedKey],
        [1, previousKey],
      ]),
      currentVersion: 2,
      legacySecret: env.BETTER_AUTH_SECRET,
    };
    const secret = "secret-enrolled-before-the-rotation-01";
    const code = await createOTP(secret, OTP).totp();
    const stored = await symmetricEncrypt({ key: beforeRotation, data: secret });

    const result = await verify(
      [{ secret: stored }],
      code,
      new DrizzleTotpVerifier(new NoOpInstrumentation(), afterRotation),
    );

    expect(result.getValue()).toBe("accepted");
  });

  it("refuses the code and reports the error when the stored secret cannot be decrypted", async () => {
    const capture = mock(() => undefined);
    const instrumentation = Object.assign(new NoOpInstrumentation(), { capture });

    const result = await verify(
      [{ secret: "not-an-encrypted-secret" }],
      "123456",
      new DrizzleTotpVerifier(instrumentation, env.BETTER_AUTH_SECRET),
    );

    expect(result.getValue()).toBe("invalid");
    expect(capture).toHaveBeenCalledTimes(1);
  });
});
