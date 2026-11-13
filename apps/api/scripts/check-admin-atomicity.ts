import { setTimeout as sleep } from "node:timers/promises";

/**
 * Proves against a real Postgres what a mocked unit of work cannot: a moderation write and its
 * audit event commit or roll back together, the sessions of a banned user and the sessions they
 * were impersonating end with the ban, every end of an impersonation is announced once, and the sign-in hook of the auth library honours a ban
 * written directly. Creates and removes its own probe users.
 */

import { AdminModerationService } from "@modules/admin/services/admin-moderation";
import { StaffService } from "@modules/admin/services/staff";
import { Result } from "@packages/ddd-kit";
import { authSchema, db, eq } from "@packages/drizzle";
import { EventTypes } from "@packages/events";
import type { IOutboxRepository } from "@packages/outbox/outbox.port";
import { checkRecorder } from "@packages/test/check-harness";
import { requireLocalDatabase } from "@packages/test/require-local-database";
import { auth } from "../src/auth";
import { di } from "../src/container";
import { adminProbes, appCall, codeOf } from "./admin-probes";

requireLocalDatabase("check-admin-atomicity");

const probes = adminProbes(`check-admin-atomicity-${crypto.randomUUID()}`);
const checks = checkRecorder();
const { check } = checks;

const EMIT_FAILURE = "forced emit failure";

const failingOutbox: IOutboxRepository = Object.assign(Object.create(di.IOutboxRepository), {
  enqueue: async () => {
    throw new Error(EMIT_FAILURE);
  },
});
const failing = new AdminModerationService(
  di.IAdminUserStore,
  failingOutbox,
  di.ITransactionService,
);

async function refusedByEmit(work: () => Promise<unknown>): Promise<boolean> {
  try {
    await work();

    return false;
  } catch (err) {
    return err instanceof Error && err.message === EMIT_FAILURE;
  }
}

async function userState(id: string) {
  const [row] = await db
    .select({
      banned: authSchema.user.banned,
      banReason: authSchema.user.banReason,
      banExpires: authSchema.user.banExpires,
    })
    .from(authSchema.user)
    .where(eq(authSchema.user.id, id));

  return row;
}

async function sessionCount(id: string): Promise<number> {
  const rows = await db
    .select({ id: authSchema.session.id })
    .from(authSchema.session)
    .where(eq(authSchema.session.userId, id));

  return rows.length;
}

async function signInStatus(email: string): Promise<number> {
  return (await probes.signIn(email)).status;
}

async function proveEmitFailureLeavesNothing(): Promise<void> {
  const actor = await probes.user("emit-actor");
  const target = await probes.user("emit-target");
  await probes.sessionCookie(target);

  const banFailed = await refusedByEmit(() =>
    failing.ban({ actorUserId: actor.id, userId: target.id, reason: "probe" }),
  );
  const afterBan = await userState(target.id);
  check("a failing emit surfaces from the ban", banFailed);
  check("a failing emit leaves user.banned unchanged", afterBan?.banned === false, afterBan);
  check("a failing emit keeps the sessions of the target", (await sessionCount(target.id)) === 1);

  const revokeFailed = await refusedByEmit(() =>
    failing.revokeSessions({ actorUserId: actor.id, userId: target.id }),
  );
  check("a failing emit surfaces from the revocation", revokeFailed);
  check("a failing emit keeps the sessions", (await sessionCount(target.id)) === 1);

  await db
    .update(authSchema.user)
    .set({ banned: true, banReason: "probe" })
    .where(eq(authSchema.user.id, target.id));
  const unbanFailed = await refusedByEmit(() =>
    failing.unban({ actorUserId: actor.id, userId: target.id }),
  );
  const afterUnban = await userState(target.id);
  check("a failing emit surfaces from the unban", unbanFailed);
  check("a failing emit leaves the ban in place", afterUnban?.banned === true, afterUnban);
}

async function proveBanRefusesSignIn(): Promise<void> {
  const actor = await probes.user("ban-actor");
  const target = await probes.user("ban-target");
  const bystander = await probes.user("ban-bystander");
  check("a sign-in works before the ban", (await signInStatus(target.email)) === 200);
  await probes.sessionCookie(bystander);

  const impersonation = await auth.$context.then((ctx) =>
    ctx.internalAdapter.createSession(bystander.id),
  );
  await db
    .update(authSchema.session)
    .set({ impersonatedBy: target.id })
    .where(eq(authSchema.session.id, impersonation.id));

  const banned = await di.AdminModerationService.ban({
    actorUserId: actor.id,
    userId: target.id,
    reason: "probe",
  });
  const state = await userState(target.id);
  check("the ban succeeds", banned.isSuccess);
  check(
    "a permanent ban writes what the library wrote",
    state?.banned === true && state.banReason === "probe" && state.banExpires === null,
    state,
  );
  check("the own sessions of the banned user end", (await sessionCount(target.id)) === 0);
  const [stillImpersonating] = await db
    .select({ id: authSchema.session.id })
    .from(authSchema.session)
    .where(eq(authSchema.session.impersonatedBy, target.id));
  check("the sessions the banned user was impersonating end", stillImpersonating === undefined);
  check(
    "a session of somebody else not impersonated survives",
    (await sessionCount(bystander.id)) === 1,
  );
  check(
    "the ban and each ended session are announced",
    (await probes.eventCount(EventTypes.ADMIN_USER_BANNED, target.id)) === 1 &&
      (await probes.eventCount(EventTypes.USER_SIGNED_OUT, target.id)) === 1 &&
      (await probes.eventCount(EventTypes.USER_SIGNED_OUT, bystander.id)) === 1,
  );

  const refused = await probes.signIn(target.email);
  check("a real sign-in is refused after the ban", refused.status === 403, refused.status);

  const unbanned = await di.AdminModerationService.unban({
    actorUserId: actor.id,
    userId: target.id,
  });
  const cleared = await userState(target.id);
  check(
    "the unban clears the ban",
    unbanned.isSuccess && cleared?.banned === false && cleared.banReason === null,
    cleared,
  );
  check("a real sign-in works after the unban", (await signInStatus(target.email)) === 200);
}

async function proveExpiredBanLetsIn(): Promise<void> {
  const actor = await probes.user("expiry-actor");
  const target = await probes.user("expiry-target");
  await di.AdminModerationService.ban({
    actorUserId: actor.id,
    userId: target.id,
    reason: "probe",
    expiresIn: 3600,
  });
  const running = await userState(target.id);
  check(
    "a temporary ban stores its expiry",
    running?.banExpires instanceof Date && running.banExpires.getTime() > Date.now(),
  );
  check("a running temporary ban refuses sign-in", (await signInStatus(target.email)) === 403);

  await db
    .update(authSchema.user)
    .set({ banExpires: new Date(Date.now() - 1000) })
    .where(eq(authSchema.user.id, target.id));
  check("an expired ban lets the user in", (await signInStatus(target.email)) === 200);
}

async function impersonationSessionOf(
  actor: string | null,
  subject: string,
  expiresAt?: Date,
): Promise<string> {
  const created = await auth.$context.then((ctx) => ctx.internalAdapter.createSession(subject));
  await db
    .update(authSchema.session)
    .set({ impersonatedBy: actor, ...(expiresAt ? { expiresAt } : {}) })
    .where(eq(authSchema.session.id, created.id));

  return created.token;
}

async function stoppedReasons(subject: string): Promise<string[]> {
  const payloads = await probes.eventPayloads(EventTypes.ADMIN_IMPERSONATION_STOPPED, subject);

  return payloads.map((payload) =>
    typeof payload === "object" && payload !== null && "endReason" in payload
      ? String(payload.endReason)
      : "",
  );
}

async function proveImpersonationEndsAnnouncedOnce(): Promise<void> {
  const staff = await probes.user("end-staff");
  const swept = await probes.user("end-swept");
  const raced = await probes.user("end-raced");
  const live = await probes.user("end-live");
  const ordinary = await probes.user("end-ordinary");
  const past = new Date(Date.now() - 60_000);
  await impersonationSessionOf(staff.id, swept.id, past);
  const racedToken = await impersonationSessionOf(staff.id, raced.id, past);
  const liveToken = await impersonationSessionOf(staff.id, live.id);
  await impersonationSessionOf(null, ordinary.id, past);

  const failingSweep = new StaffService(
    di.IStaffStore,
    di.IAdminUserStore,
    failingOutbox,
    di.ITransactionService,
    { PLATFORM_ADMIN_IDS: [] },
  );
  check(
    "a failing emit surfaces from the impersonation sweep",
    await refusedByEmit(() => failingSweep.expireImpersonations(100)),
  );
  check("a failing emit keeps the expired session", (await sessionCount(swept.id)) === 1);

  const ctx = await auth.$context;
  const [sweep] = await Promise.all([
    di.StaffService.expireImpersonations(100),
    ctx.internalAdapter.deleteSession(racedToken),
  ]);
  check("the impersonation sweep succeeds", sweep.isSuccess);
  check(
    "the expired impersonations end",
    (await sessionCount(swept.id)) === 0 && (await sessionCount(raced.id)) === 0,
  );
  check(
    "a sweep racing the library on one expired session announces it once",
    JSON.stringify(await stoppedReasons(raced.id)) === '["expired"]',
    await stoppedReasons(raced.id),
  );

  const again = await di.StaffService.expireImpersonations(100);
  check("a second sweep succeeds", again.isSuccess);
  check(
    "each expired impersonation is announced once, as expired",
    JSON.stringify(await stoppedReasons(swept.id)) === '["expired"]',
    await stoppedReasons(swept.id),
  );
  const sweptSignOuts = await probes.eventPayloads(EventTypes.USER_SIGNED_OUT, swept.id);
  const [sweptSignOut] = sweptSignOuts;
  check(
    "each expired impersonation is announced signed out once, by no one",
    sweptSignOuts.length === 1 &&
      typeof sweptSignOut === "object" &&
      sweptSignOut !== null &&
      "actorUserId" in sweptSignOut &&
      sweptSignOut.actorUserId === null,
    sweptSignOuts,
  );
  check(
    "a sweep racing the library on one expired session announces its sign-out once",
    (await probes.eventCount(EventTypes.USER_SIGNED_OUT, raced.id)) === 1,
    await probes.eventPayloads(EventTypes.USER_SIGNED_OUT, raced.id),
  );
  check(
    "a live impersonation and an ordinary expired session are left to their paths",
    (await sessionCount(live.id)) === 1 &&
      (await sessionCount(ordinary.id)) === 1 &&
      (await stoppedReasons(ordinary.id)).length === 0,
  );

  const met = await probes.user("end-met");
  const metToken = await impersonationSessionOf(staff.id, met.id, past);
  await ctx.internalAdapter.deleteSession(metToken);
  await ctx.internalAdapter.deleteSession(metToken);
  check(
    "the library deleting an expired impersonation announces it once, as expired",
    (await sessionCount(met.id)) === 0 &&
      JSON.stringify(await stoppedReasons(met.id)) === '["expired"]',
    await stoppedReasons(met.id),
  );

  await ctx.internalAdapter.deleteSession(liveToken);
  await ctx.internalAdapter.deleteSession(liveToken);
  check(
    "the library deleting a live impersonation outside a stop announces it revoked, once",
    (await sessionCount(live.id)) === 0 &&
      JSON.stringify(await stoppedReasons(live.id)) === '["revoked"]',
    await stoppedReasons(live.id),
  );

  const signedOut = await probes.user("end-signed-out");
  const cookie = await probes.sessionCookie(signedOut);
  await db
    .update(authSchema.session)
    .set({ impersonatedBy: staff.id })
    .where(eq(authSchema.session.userId, signedOut.id));
  const signOut = await appCall(cookie, "POST", "/api/auth/sign-out", {});
  check("a sign-out while impersonating succeeds", signOut.status === 200, signOut.status);
  check(
    "a sign-out while impersonating announces it stopped, once",
    (await sessionCount(signedOut.id)) === 0 &&
      JSON.stringify(await stoppedReasons(signedOut.id)) === '["stopped"]',
    await stoppedReasons(signedOut.id),
  );
  check(
    "a sign-out while impersonating announces the sign-out once",
    (await probes.eventCount(EventTypes.USER_SIGNED_OUT, signedOut.id)) === 1,
    await probes.eventPayloads(EventTypes.USER_SIGNED_OUT, signedOut.id),
  );
}

async function proveRevocationEndsImpersonations(): Promise<void> {
  const actor = await probes.user("revoke-actor");
  const target = await probes.user("revoke-target");
  const subject = await probes.user("revoke-subject");
  await impersonationSessionOf(target.id, subject.id);

  const revoked = await di.AdminModerationService.revokeSessions({
    actorUserId: actor.id,
    userId: target.id,
  });
  check("the revocation succeeds", revoked.isSuccess);
  check(
    "it ends the sessions the user impersonates through",
    (await sessionCount(subject.id)) === 0,
  );
  const [announced] = await probes.eventPayloads(EventTypes.USER_SIGNED_OUT, subject.id);
  check(
    "the ended impersonation is announced revoked",
    JSON.stringify(await stoppedReasons(subject.id)) === '["revoked"]',
    await stoppedReasons(subject.id),
  );
  check(
    "the ended session names the admin as actor",
    typeof announced === "object" &&
      announced !== null &&
      "actorUserId" in announced &&
      announced.actorUserId === actor.id,
    announced,
  );
}

async function proveRevocationRacingSignOutAnnouncesOnce(): Promise<void> {
  const actor = await probes.user("race-sign-out-actor");
  const target = await probes.user("race-sign-out-target");
  const cookie = await probes.sessionCookie(target);

  let signingOut: Promise<unknown> = Promise.resolve();
  const revoked = await di.ITransactionService.run(async () => {
    const ended = await di.AdminModerationService.revokeSessions({
      actorUserId: actor.id,
      userId: target.id,
    });
    signingOut = appCall(cookie, "POST", "/api/auth/sign-out", {});
    await sleep(500);

    return ended;
  });
  await signingOut;

  check("a revocation racing a sign-out succeeds", revoked.isSuccess);
  check(
    "a revocation racing a sign-out of an ordinary session announces the sign-out once",
    (await probes.eventCount(EventTypes.USER_SIGNED_OUT, target.id)) === 1,
    await probes.eventPayloads(EventTypes.USER_SIGNED_OUT, target.id),
  );
}

async function proveUnbanOfNonBannedIsNoOp(): Promise<void> {
  const actor = await probes.user("noop-actor");
  const target = await probes.user("noop-target");
  const before = await db
    .select({ updatedAt: authSchema.user.updatedAt })
    .from(authSchema.user)
    .where(eq(authSchema.user.id, target.id));

  const unbanned = await di.AdminModerationService.unban({
    actorUserId: actor.id,
    userId: target.id,
  });
  const after = await db
    .select({ updatedAt: authSchema.user.updatedAt })
    .from(authSchema.user)
    .where(eq(authSchema.user.id, target.id));
  check("unbanning a user who is not banned succeeds", unbanned.isSuccess);
  check("it writes nothing", before[0]?.updatedAt.getTime() === after[0]?.updatedAt.getTime());
  check(
    "it announces nothing",
    (await probes.eventCount(EventTypes.ADMIN_USER_UNBANNED, target.id)) === 0,
  );

  const ghost = await di.AdminModerationService.unban({
    actorUserId: actor.id,
    userId: `${target.id}-ghost`,
  });
  check(
    "unbanning an unknown user still answers not found",
    ghost.isFailure && ghost.getError().code === "ADMIN_USER_NOT_FOUND",
  );
}

async function proveBanRaceRefusedOnRequest(): Promise<void> {
  const target = await probes.user("race-target");
  const cookie = await probes.sessionCookie(target);
  const live = await appCall(cookie, "GET", "/me/policies");
  check("a session works before the ban", live.status === 200, live.status);

  await db
    .update(authSchema.user)
    .set({ banned: true, banReason: "probe" })
    .where(eq(authSchema.user.id, target.id));
  const refused = await appCall(cookie, "GET", "/me/policies");
  check("a session that outlived its ban is refused", refused.status === 401, refused.status);

  await db
    .update(authSchema.user)
    .set({ banExpires: new Date(Date.now() - 1000) })
    .where(eq(authSchema.user.id, target.id));
  const expired = await appCall(cookie, "GET", "/me/policies");
  check("a session past the ban expiry works again", expired.status === 200, expired.status);
}

async function proveExpiryIsAnnounced(): Promise<void> {
  const target = await probes.user("expiry-event-target");
  await db
    .update(authSchema.user)
    .set({ banned: true, banReason: "probe", banExpires: new Date(Date.now() - 1000) })
    .where(eq(authSchema.user.id, target.id));

  check("the sign-in clears the expired ban", (await signInStatus(target.email)) === 200);
  const state = await userState(target.id);
  check("the columns are cleared", state?.banned === false && state.banExpires === null, state);
  const payloads = await probes.eventPayloads(EventTypes.ADMIN_USER_UNBANNED, target.id);
  check(
    "the expiry is announced once with a null actor",
    payloads.length === 1 && JSON.stringify(payloads[0]).includes('"actorUserId":null'),
    payloads,
  );
}

async function proveResetSurfacesSwallowedFailure(): Promise<void> {
  const manager = await probes.manager("reset-manager");
  const cookie = await probes.sessionCookie(manager);
  await probes.enrolTwoFactor(manager);
  const target = await probes.user("reset-target");
  await probes.sessionCookie(target);
  const path = `/admin/users/${target.id}/reset-password`;

  const email = di.IEmailService;
  const realSend = email.sendTemplate;
  email.sendTemplate = async () =>
    Result.fail({ code: "EMAIL_PROVIDER_FAILURE", message: "forced" });
  const failed = await appCall(cookie, "POST", path);
  email.sendTemplate = realSend;

  check(
    "a mail failure the library swallows answers a typed retryable failure",
    codeOf(failed) === "ADMIN_PASSWORD_RESET_UNAVAILABLE",
    failed.body,
  );
  check("the sessions stay revoked, the safe state", (await sessionCount(target.id)) === 0);
  check(
    "the reset stays announced",
    (await probes.eventCount(EventTypes.ADMIN_USER_PASSWORD_RESET, target.id)) === 1,
  );

  const retried = await appCall(cookie, "POST", path);
  check("the admin can retry", retried.status === 200, retried.body);
}

async function main(): Promise<void> {
  await proveEmitFailureLeavesNothing();
  await proveBanRefusesSignIn();
  await proveExpiredBanLetsIn();
  await proveRevocationEndsImpersonations();
  await proveImpersonationEndsAnnouncedOnce();
  await proveRevocationRacingSignOutAnnouncesOnce();
  await proveUnbanOfNonBannedIsNoOp();
  await proveBanRaceRefusedOnRequest();
  await proveExpiryIsAnnounced();
  await proveResetSurfacesSwallowedFailure();
  await probes.cleanup();

  if (checks.failures > 0) {
    console.error(`\n${checks.failures} check(s) failed`);
    process.exit(1);
  }
  console.log("\nAll assertions passed, admin writes and their events are atomic.");
  process.exit(0);
}

main().catch(async (err) => {
  console.error("check-admin-atomicity crashed:", err);
  await probes.cleanup().catch(() => {});
  process.exit(1);
});
