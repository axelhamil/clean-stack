/**
 * Proves against a real Postgres that the account-deletion step-up only trusts a confirmed
 * two-factor enrolment, the rule better-auth applies at sign-in (`verified === false` is
 * refused, a legacy `NULL` is not).
 *
 * The filter lives in the `WHERE` of `DrizzleTotpVerifier.verify`, which a mocked
 * transaction never evaluates: only Postgres can show that an unconfirmed row is skipped.
 * Creates and removes its own probe user.
 */

import { checkRecorder, seedTwoFactor } from "./check-harness";
import { requireLocalDatabase } from "./require-local-database";

requireLocalDatabase("check-totp-enrolment");

import { createOTP } from "@better-auth/utils/otp";
import { authSchema, db, eq, staffSchema } from "@packages/drizzle";
import { authSecretKey } from "../src/shared/auth/auth-secrets";
import { TOTP_OPTIONS } from "../src/shared/auth/totp-options";
import { env } from "../src/shared/env";
import { DrizzleTotpVerifier } from "../src/shared/services/drizzle-totp-verifier";
import { NoOpInstrumentation } from "../src/shared/services/noop-instrumentation";

const userId = `check-totp-enrolment-${crypto.randomUUID()}`;
const totpSecret = `check-totp-enrolment-secret-${crypto.randomUUID()}`;

const checks = checkRecorder();
const { check } = checks;

async function cleanup(): Promise<void> {
  await db.delete(authSchema.user).where(eq(authSchema.user.id, userId));
}

async function seed(): Promise<void> {
  await db.insert(authSchema.user).values({
    id: userId,
    name: "TOTP Enrolment Probe",
    email: `${userId}@example.com`,
    emailVerified: true,
    locale: "en",
  });
  await seedTwoFactor(userId, totpSecret, false);
}

async function setVerified(verified: boolean | null): Promise<void> {
  await db
    .update(authSchema.twoFactor)
    .set({ verified })
    .where(eq(authSchema.twoFactor.userId, userId));
}

async function verifiesCurrentCode(): Promise<boolean> {
  const code = await createOTP(totpSecret, TOTP_OPTIONS).totp();
  await db
    .delete(staffSchema.adminTotpCounter)
    .where(eq(staffSchema.adminTotpCounter.userId, userId));
  const verifier = new DrizzleTotpVerifier(new NoOpInstrumentation(), authSecretKey(env));
  const result = await verifier.consume(userId, code);

  return result.isSuccess && result.getValue() === "accepted";
}

async function main(): Promise<void> {
  await cleanup();
  await seed();

  const unconfirmed = await verifiesCurrentCode();
  console.log("[1] valid code, enrolment never confirmed ->", unconfirmed);
  check("a valid code of an unconfirmed enrolment is refused", !unconfirmed);

  await setVerified(true);
  const confirmed = await verifiesCurrentCode();
  console.log("[2] valid code, enrolment confirmed ->", confirmed);
  check("a valid code of a confirmed enrolment is accepted", confirmed);

  await setVerified(null);
  const legacy = await verifiesCurrentCode();
  console.log("[3] valid code, enrolment predating the verified column ->", legacy);
  check("a valid code of a legacy enrolment (verified NULL) is accepted", legacy);

  await cleanup();

  if (checks.failures > 0) {
    console.error(`\n${checks.failures} check(s) failed`);
    process.exit(1);
  }
  console.log("\nAll assertions passed, only confirmed enrolments confirm an account deletion.");
  process.exit(0);
}

main().catch(async (err) => {
  console.error("check-totp-enrolment crashed:", err);
  await cleanup().catch(() => {});
  process.exit(1);
});
