/**
 * Proves against a real Postgres and the real route stack what mocks cannot: the admin step-up
 * opens on one real code for one session, closes on expiry, on a wrong or replayed code, without
 * two-factor and under impersonation, and dies with its session through the foreign key. The
 * conditional upsert behind replay refusal only exists in SQL. Creates and removes its own
 * probe users.
 */

import { createOTP } from "@better-auth/utils/otp";
import { authSchema, db, eq, staffSchema } from "@packages/drizzle";
import { EventTypes } from "@packages/events";
import { app } from "../src/app";
import { TOTP_OPTIONS } from "../src/shared/auth/totp-options";
import { env } from "../src/shared/env";
import { type AdminProbe, adminProbes } from "./admin-probes";
import { checkRecorder } from "./check-harness";
import { requireLocalDatabase } from "./require-local-database";

requireLocalDatabase("check-admin-step-up");

const probes = adminProbes(`check-admin-step-up-${crypto.randomUUID()}`);
const checks = checkRecorder();
const { check } = checks;

const ORIGIN = env.CORS_ORIGIN?.[0] ?? "http://localhost:5173";
const RACERS = 8;
let nextAddress = 1;

function freshIp(): string {
  nextAddress += 1;

  return `198.51.100.${nextAddress}`;
}

interface Call {
  status: number;
  body: { error?: { code?: string }; stepUpValidUntil?: string | null };
  response: Response;
}

async function call(
  cookie: string,
  method: string,
  path: string,
  body?: unknown,
  ip = freshIp(),
): Promise<Call> {
  const response = await app.request(
    path,
    {
      method,
      headers: { cookie, origin: ORIGIN, "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    },
    { server: { requestIP: () => ({ address: ip, family: "IPv4", port: 1 }) } },
  );

  return { status: response.status, body: await response.clone().json(), response };
}

function currentCounter(): number {
  return Math.floor(Date.now() / 1000 / (TOTP_OPTIONS.period ?? 30));
}

function codeAt(probe: AdminProbe, counter: number): Promise<string> {
  return createOTP(probe.totpSecret, TOTP_OPTIONS).hotp(counter);
}

function submit(cookie: string, code: string, ip?: string): Promise<Call> {
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

function codeOf(result: Call): string | undefined {
  return result.body.error?.code;
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
  const ip = "203.0.113.77";
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

async function main(): Promise<void> {
  await proveTheGateOpensAndCloses();
  await proveExpiry();
  await proveNoTwoFactor();
  await proveImpersonationFailsClosed();
  await proveSessionCascade();
  await proveRacingCode();
  await proveRateLimit();
  await proveSensitiveRoutes();
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
