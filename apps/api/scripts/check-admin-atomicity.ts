/**
 * Proves against a real Postgres what a mocked unit of work cannot: a moderation write and its
 * audit event commit or roll back together, the sessions of a banned user and the sessions they
 * were impersonating end with the ban, and the sign-in hook of the auth library honours a ban
 * written directly. Creates and removes its own probe users.
 */

import { authSchema, db, eq } from "@packages/drizzle";
import { EventTypes } from "@packages/events";
import { auth } from "../src/auth";
import { di } from "../src/container";
import { AdminModerationService } from "../src/modules/admin/application/services/admin-moderation.service";
import type { IOutboxRepository } from "../src/shared/ports/outbox.port";
import { adminProbes } from "./admin-probes";
import { checkRecorder } from "./check-harness";
import { requireLocalDatabase } from "./require-local-database";

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

async function main(): Promise<void> {
  await proveEmitFailureLeavesNothing();
  await proveBanRefusesSignIn();
  await proveExpiredBanLetsIn();
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
