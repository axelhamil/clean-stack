/**
 * Proves against a real Postgres and the real route stack what mocks cannot: the admin step-up
 * opens on one real code for one session, closes on expiry, on a wrong or replayed code, without
 * two-factor and under impersonation, and dies with its session through the foreign key. The
 * conditional upsert behind replay refusal only exists in SQL. Creates and removes its own
 * probe users.
 */

import { Result } from "@packages/ddd-kit";
import { authSchema, db, eq, staffSchema } from "@packages/drizzle";
import { EventTypes } from "@packages/events";
import { di } from "../src/container";
import { env } from "../src/shared/env";
import {
  type AdminProbe,
  type AppCall,
  adminProbes,
  appCall,
  codeAt,
  codeOf,
  currentCounter,
  freshIp,
} from "./admin-probes";
import { checkRecorder } from "./check-harness";
import { requireLocalDatabase } from "./require-local-database";

requireLocalDatabase("check-admin-step-up");

const probes = adminProbes(`check-admin-step-up-${crypto.randomUUID()}`);
const checks = checkRecorder();
const { check } = checks;

const RACERS = 8;
const DAY_SECONDS = 24 * 60 * 60;

const call = appCall;

function submit(cookie: string, code: string, ip?: string): Promise<AppCall> {
  return call(cookie, "POST", "/admin/step-up", { code }, ip);
}

async function confirmedManager(name: string) {
  const probe = await probes.manager(name);
  const cookie = await probes.sessionCookie(probe);
  const otherCookie = await probes.sessionCookie(probe);
  await probes.enrolTwoFactor(probe);

  return { probe, cookie, otherCookie };
}

async function confirmedSessionOf(userId: string): Promise<string> {
  const [row] = await db
    .select({ id: staffSchema.adminStepUp.sessionId })
    .from(staffSchema.adminStepUp)
    .innerJoin(authSchema.session, eq(authSchema.session.id, staffSchema.adminStepUp.sessionId))
    .where(eq(authSchema.session.userId, userId));
  if (!row) throw new Error(`no confirmed session for ${userId}`);

  return row.id;
}

async function stepUpRows(sessionId: string): Promise<number> {
  const rows = await db
    .select({ id: staffSchema.adminStepUp.sessionId })
    .from(staffSchema.adminStepUp)
    .where(eq(staffSchema.adminStepUp.sessionId, sessionId));

  return rows.length;
}

async function banOf(userId: string): Promise<boolean | null | undefined> {
  const [row] = await db
    .select({ banned: authSchema.user.banned })
    .from(authSchema.user)
    .where(eq(authSchema.user.id, userId));

  return row?.banned;
}

async function proveTheGateOpensAndCloses(): Promise<void> {
  const { probe, cookie, otherCookie } = await confirmedManager("gate");
  const target = await probes.user("gate-target");
  const banPath = `/admin/users/${target.id}/ban`;

  const refused = await call(cookie, "POST", banPath, { reason: "probe" });
  check(
    "a permanent ban without step-up answers ADMIN_REAUTH_REQUIRED",
    refused.status === 403 && codeOf(refused) === "ADMIN_REAUTH_REQUIRED",
    refused.body,
  );
  check("the refused ban writes nothing", (await banOf(target.id)) === false);

  const wrong = await submit(cookie, "000000");
  check("a wrong code is refused", codeOf(wrong) === "ADMIN_STEP_UP_CODE_INVALID", wrong.body);
  check(
    "a wrong code is announced",
    (await probes.eventCount(EventTypes.ADMIN_STEP_UP_FAILED, probe.id)) === 1,
  );
  const stillClosed = await call(cookie, "GET", "/admin/me");
  check("a wrong code opens nothing", stillClosed.body.stepUpValidUntil === null, stillClosed.body);

  const counter = currentCounter();
  const accepted = await submit(cookie, await codeAt(probe, counter));
  check("the current code is accepted", accepted.status === 200, accepted.body);
  check(
    "the success is announced",
    (await probes.eventCount(EventTypes.ADMIN_STEP_UP_VERIFIED, probe.id)) === 1,
  );
  const open = await call(cookie, "GET", "/admin/me");
  check("GET /admin/me exposes the deadline", typeof open.body.stepUpValidUntil === "string");

  const other = await call(otherCookie, "POST", banPath, { reason: "probe" });
  check("a step-up belongs to one session", codeOf(other) === "ADMIN_REAUTH_REQUIRED", other.body);

  const replay = await submit(cookie, await codeAt(probe, counter));
  check(
    "a replayed code is refused",
    codeOf(replay) === "ADMIN_STEP_UP_REPLAY_INVALID",
    replay.body,
  );
  const older = await submit(cookie, await codeAt(probe, counter - 1));
  check(
    "an older code of the window is refused after a newer one",
    codeOf(older) === "ADMIN_STEP_UP_REPLAY_INVALID",
  );

  const passes = await call(cookie, "POST", banPath, { reason: "probe" });
  check("the confirmed session can ban", passes.status === 200, passes.body);
  check("the ban took effect", (await banOf(target.id)) === true);
}

async function proveExpiry(): Promise<void> {
  const { probe, cookie } = await confirmedManager("expiry");
  const target = await probes.user("expiry-target");
  await submit(cookie, await codeAt(probe, currentCounter()));
  const sessionId = await confirmedSessionOf(probe.id);

  await db
    .update(staffSchema.adminStepUp)
    .set({ verifiedAt: new Date(Date.now() - (env.ADMIN_STEP_UP_TTL_SECONDS + 1) * 1000) })
    .where(eq(staffSchema.adminStepUp.sessionId, sessionId));

  const refused = await call(cookie, "POST", `/admin/users/${target.id}/ban`, { reason: "probe" });
  check("an expired step-up is refused", codeOf(refused) === "ADMIN_REAUTH_REQUIRED", refused.body);
  const me = await call(cookie, "GET", "/admin/me");
  check("an expired step-up exposes no deadline", me.body.stepUpValidUntil === null, me.body);
}

async function proveNoTwoFactor(): Promise<void> {
  const { probe, cookie } = await confirmedManager("no-2fa");
  const target = await probes.user("no-2fa-target");
  await submit(cookie, await codeAt(probe, currentCounter()));
  await db
    .update(authSchema.user)
    .set({ twoFactorEnabled: false })
    .where(eq(authSchema.user.id, probe.id));

  const banned = await call(cookie, "POST", `/admin/users/${target.id}/ban`, { reason: "probe" });
  check(
    "dropping two-factor closes a confirmed session",
    banned.status === 403 && (await banOf(target.id)) === false,
    banned.body,
  );
  const code = await codeAt(probe, currentCounter() + 1);
  const submitted = await submit(cookie, code);
  check("no code can be submitted without two-factor", submitted.status === 403, submitted.body);
}

async function proveImpersonationFailsClosed(): Promise<void> {
  const { probe, cookie } = await confirmedManager("impersonated");
  const target = await probes.user("impersonated-target");
  const impersonator = await probes.manager("impersonated-by");
  await submit(cookie, await codeAt(probe, currentCounter()));
  await db
    .update(authSchema.session)
    .set({ impersonatedBy: impersonator.id })
    .where(eq(authSchema.session.userId, probe.id));

  const banned = await call(cookie, "POST", `/admin/users/${target.id}/ban`, { reason: "probe" });
  check(
    "an impersonated session cannot use a step-up",
    banned.status === 403 && (await banOf(target.id)) === false,
    banned.body,
  );
}

async function proveSessionCascade(): Promise<void> {
  const { probe, cookie } = await confirmedManager("cascade");
  await submit(cookie, await codeAt(probe, currentCounter()));
  const sessionId = await confirmedSessionOf(probe.id);
  check("the confirmation is stored", (await stepUpRows(sessionId)) === 1);

  await db.delete(authSchema.session).where(eq(authSchema.session.id, sessionId));
  check("deleting the session deletes the confirmation", (await stepUpRows(sessionId)) === 0);
}

async function proveRacingCode(): Promise<void> {
  const { probe, cookie } = await confirmedManager("race");
  const code = await codeAt(probe, currentCounter());
  const results = await Promise.all(Array.from({ length: RACERS }, () => submit(cookie, code)));
  const winners = results.filter((result) => result.status === 200).length;
  check("one code racing itself is accepted once", winners === 1, winners);
}

async function proveRateLimit(): Promise<void> {
  const { cookie } = await confirmedManager("limit");
  const ip = freshIp();
  const statuses: number[] = [];
  for (let attempt = 0; attempt < 6; attempt += 1) {
    statuses.push((await submit(cookie, "000000", ip)).status);
  }
  check("the sixth attempt from one address is limited", statuses.at(-1) === 429, statuses);
}

async function proveSensitiveRoutes(): Promise<void> {
  const { probe, cookie } = await confirmedManager("routes");
  const target = await probes.user("routes-target");
  const start = `/admin/impersonation/${target.id}/start`;
  const body = { reason: "check-admin-step-up probe" };

  const refused = await call(cookie, "POST", start, body);
  check(
    "an impersonation start needs a step-up",
    codeOf(refused) === "ADMIN_REAUTH_REQUIRED",
    refused.body,
  );

  await submit(cookie, await codeAt(probe, currentCounter()));
  const started = await call(cookie, "POST", start, body);
  check("a confirmed session starts an impersonation", started.status === 200, started.body);
  check(
    "the real start relays its cookie",
    started.response.headers.getSetCookie().some((c) => c.includes("session_token")),
  );
  const [row] = await db
    .select({ id: authSchema.session.id })
    .from(authSchema.session)
    .where(eq(authSchema.session.impersonatedBy, probe.id));
  check("the impersonation session exists", row !== undefined);
  check(
    "the start is announced",
    (await probes.eventCount(EventTypes.ADMIN_IMPERSONATION_STARTED, target.id)) === 1,
  );
}

async function proveLongBanNeedsPermanentRoute(): Promise<void> {
  const { cookie } = await confirmedManager("long-ban");
  const target = await probes.user("long-ban-target");
  const banPath = `/admin/users/${target.id}/ban`;

  for (const expiresIn of [100 * 365 * DAY_SECONDS, 1e15]) {
    const refused = await call(cookie, "POST", banPath, { reason: "probe", expiresIn });
    check(`a ${expiresIn} s ban is refused`, refused.status === 400, refused.body);
    check("the refused long ban writes nothing", (await banOf(target.id)) === false);
  }

  const limit = await call(cookie, "POST", banPath, {
    reason: "probe",
    expiresIn: 90 * DAY_SECONDS,
  });
  check("a 90 day ban needs no step-up", limit.status === 200, limit.body);
}

async function realTwoFactorSignIn(probe: AdminProbe, code: string): Promise<AppCall> {
  const challenge = await appCall("", "POST", "/api/auth/sign-in/email", {
    email: probe.email,
    password: probes.password,
  });
  const cookie = challenge.response.headers
    .getSetCookie()
    .map((value) => value.split(";")[0])
    .join("; ");

  return appCall(cookie, "POST", "/api/auth/two-factor/verify-totp", { code });
}

function sessionCookieOf(result: AppCall): string {
  return result.response.headers
    .getSetCookie()
    .map((value) => value.split(";")[0] ?? "")
    .filter((pair) => pair.includes("session_token"))
    .join("; ");
}

async function proveOtherFlowsBurnTheCode(): Promise<void> {
  const signedIn = await confirmedManager("burn-sign-in");
  const signInCode = await codeAt(signedIn.probe, currentCounter());
  const verified = await realTwoFactorSignIn(signedIn.probe, signInCode);
  check("a real two-factor sign-in succeeds", verified.status === 200, verified.body);
  const replayedSignIn = await submit(signedIn.cookie, signInCode);
  check(
    "a code used at sign-in cannot confirm a step-up",
    codeOf(replayedSignIn) === "ADMIN_STEP_UP_REPLAY_INVALID",
    replayedSignIn.body,
  );

  const leaving = await confirmedManager("burn-rgpd");
  const spare = await probes.manager("burn-rgpd-spare");
  check("a second manager exists for the deletion", spare.id.length > 0);
  const rgpdCode = await codeAt(leaving.probe, currentCounter());
  const deletion = await di.RgpdService.requestAccountDeletion({
    userId: leaving.probe.id,
    totpCode: rgpdCode,
  });
  check("the deletion accepts the code", deletion.isSuccess);
  const replayedDeletion = await submit(leaving.cookie, rgpdCode);
  check(
    "a code used for a deletion cannot confirm a step-up",
    codeOf(replayedDeletion) === "ADMIN_STEP_UP_REPLAY_INVALID",
    replayedDeletion.body,
  );
}

async function proveSignInSurvivesRecordingFailure(): Promise<void> {
  const { probe } = await confirmedManager("burn-failure");
  const verifier = di.ITotpVerifier;
  const realConsume = verifier.consume;
  verifier.consume = async () =>
    Result.fail({ code: "TOTP_VERIFIER_PROVIDER_FAILURE", message: "forced" });
  const verified = await realTwoFactorSignIn(probe, await codeAt(probe, currentCounter()));
  verifier.consume = realConsume;

  check("a failure to record the code does not block sign-in", verified.status === 200);
  check("that sign-in still opens a session", sessionCookieOf(verified).length > 0);
}

async function provePerUserLimit(): Promise<void> {
  const { cookie } = await confirmedManager("user-limit");
  const statuses: number[] = [];
  for (let attempt = 0; attempt < 6; attempt += 1) {
    statuses.push((await submit(cookie, "000000", freshIp())).status);
  }
  check(
    "the sixth attempt of one user is limited across addresses",
    statuses.at(-1) === 429,
    statuses,
  );
}

async function proveNoTwoFactorRefusalIsAccurate(): Promise<void> {
  const probe = await probes.manager("no-mfa-policy");
  const cookie = await probes.sessionCookie(probe);
  const target = await probes.user("no-mfa-policy-target");
  const banPath = `/admin/users/${target.id}/ban`;
  Object.assign(env, { PLATFORM_ADMIN_REQUIRE_MFA: false });

  const permanent = await call(cookie, "POST", banPath, { reason: "probe" });
  const submitted = await submit(cookie, "000000");
  const timed = await call(cookie, "POST", banPath, { reason: "probe", expiresIn: DAY_SECONDS });
  Object.assign(env, { PLATFORM_ADMIN_REQUIRE_MFA: true });

  check(
    "a sensitive action without two-factor says to turn it on",
    codeOf(permanent) === "ADMIN_STEP_UP_MFA_FORBIDDEN",
    permanent.body,
  );
  check(
    "no enrolled secret refuses a code the same way",
    codeOf(submitted) === "ADMIN_STEP_UP_MFA_FORBIDDEN",
    submitted.body,
  );
  check("a timed ban keeps working without two-factor", timed.status === 200, timed.body);
}

async function main(): Promise<void> {
  await proveTheGateOpensAndCloses();
  await proveExpiry();
  await proveNoTwoFactor();
  await proveImpersonationFailsClosed();
  await proveSessionCascade();
  await proveRacingCode();
  await proveRateLimit();
  await proveSensitiveRoutes();
  await proveLongBanNeedsPermanentRoute();
  await proveOtherFlowsBurnTheCode();
  await proveSignInSurvivesRecordingFailure();
  await provePerUserLimit();
  await proveNoTwoFactorRefusalIsAccurate();
  await probes.cleanup();

  if (checks.failures > 0) {
    console.error(`\n${checks.failures} check(s) failed`);
    process.exit(1);
  }
  console.log("\nAll assertions passed, the admin step-up holds on the real stack.");
  process.exit(0);
}

main().catch(async (err) => {
  console.error("check-admin-step-up crashed:", err);
  await probes.cleanup().catch(() => {});
  process.exit(1);
});
