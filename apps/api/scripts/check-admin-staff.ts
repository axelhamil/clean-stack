/**
 * Proves against a real Postgres what mocks cannot: the bootstrap insert of a listed id
 * announces once however many first requests race and revives a revoked row, the last-manager
 * guard holds when two managers revoke or ban each other at the same time, a banned or deleted
 * manager does not count, an account wipe revokes its staff row in its own transaction, the
 * CHECK constraints refuse an unknown source or effect, and the migration's data step gives an
 * existing `role = admin` user a manager row and a deleted one nothing. The lock and the
 * `ON CONFLICT` live in SQL, a mocked transaction evaluates neither. Creates and removes its
 * own probe users.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Option, Result } from "@packages/ddd-kit";
import {
  and,
  authSchema,
  db,
  eq,
  inArray,
  or,
  outboxSchema,
  sql,
  staffSchema,
} from "@packages/drizzle";
import { EventTypes } from "@packages/events";
import { hashPassword } from "better-auth/crypto";
import { di } from "../src/container";
import { StaffService } from "../src/modules/admin/application/services/staff.service";
import { StaffAccessService } from "../src/shared/services/staff-access.service";
import { checkRecorder } from "./check-harness";
import { requireLocalDatabase } from "./require-local-database";

requireLocalDatabase("check-admin-staff");

const RACERS = 20;
const ROUNDS = 10;
const prefix = `check-admin-staff-${crypto.randomUUID()}`;
const listedId = `${prefix}-listed`;
const managerA = `${prefix}-a`;
const managerB = `${prefix}-b`;
const legacyAdmin = `${prefix}-legacy`;
const plainUser = `${prefix}-plain`;
const legacyDeleted = `${prefix}-legacy-deleted`;
const leaver = `${prefix}-leaver`;
const ghost = `${prefix}-ghost`;
const revivedId = `${prefix}-revived`;
const formerListed = `${prefix}-former`;
const supportActor = `${prefix}-support`;
const probeIds = [
  listedId,
  managerA,
  managerB,
  legacyAdmin,
  plainUser,
  legacyDeleted,
  leaver,
  ghost,
  revivedId,
  formerListed,
  supportActor,
];
const PASSWORD = "check-admin-staff-password";

const checks = checkRecorder();
const { check } = checks;

async function cleanup(): Promise<void> {
  await db
    .delete(outboxSchema.outboxEvent)
    .where(inArray(outboxSchema.outboxEvent.aggregateId, probeIds));
  await db.execute(
    sql`DELETE FROM email_message WHERE ${or(...probeIds.map((id) => sql`to_address = ${`${id}@example.com`}`))}`,
  );
  await db.delete(authSchema.user).where(inArray(authSchema.user.id, probeIds));
}

async function seed(): Promise<void> {
  await db.insert(authSchema.user).values(
    probeIds.map((id) => ({
      id,
      name: id,
      email: `${id}@example.com`,
      emailVerified: true,
      locale: "en",
      role: id === legacyAdmin || id === legacyDeleted ? "admin" : "user",
      deletedAt: id === legacyDeleted ? new Date() : null,
    })),
  );
}

async function staffEvents(userId: string, eventType: string): Promise<number> {
  const rows = await db
    .select({ id: outboxSchema.outboxEvent.id })
    .from(outboxSchema.outboxEvent)
    .where(
      and(
        eq(outboxSchema.outboxEvent.aggregateId, userId),
        eq(outboxSchema.outboxEvent.eventType, eventType),
      ),
    );

  return rows.length;
}

async function mirrorRole(userId: string): Promise<string | null> {
  const [row] = await db
    .select({ role: authSchema.user.role })
    .from(authSchema.user)
    .where(eq(authSchema.user.id, userId));

  return row?.role ?? null;
}

async function proveBootstrapEmitsOnce(): Promise<void> {
  const service = new StaffAccessService(
    di.IStaffStore,
    di.IOutboxRepository,
    di.ITransactionService,
    { PLATFORM_ADMIN_IDS: [listedId], PLATFORM_ADMIN_REQUIRE_MFA: false },
  );
  const user = { id: listedId, twoFactorEnabled: false };

  const results = await Promise.all(
    Array.from({ length: RACERS }, () => service.gate(user, { impersonatedBy: null })),
  );

  check(
    `${RACERS} racing first requests all resolve to manager`,
    results.every((r) => r.isSuccess && r.getValue().unwrap().role === "manager"),
  );

  const announced = await staffEvents(listedId, EventTypes.ADMIN_STAFF_ADDED);
  console.log("[1] added events after the race ->", announced);
  check("the bootstrap insert emits exactly once", announced === 1);

  const [event] = await db
    .select({ payload: outboxSchema.outboxEvent.payload })
    .from(outboxSchema.outboxEvent)
    .where(eq(outboxSchema.outboxEvent.aggregateId, listedId));
  check(
    "the bootstrap event names no actor",
    JSON.stringify(event?.payload).includes('"actorUserId":null'),
  );
  check("the bootstrap writes the mirror role", (await mirrorRole(listedId)) === "admin");

  await service.gate(user, { impersonatedBy: null });
  check(
    "a later request announces nothing more",
    (await staffEvents(listedId, EventTypes.ADMIN_STAFF_ADDED)) === 1,
  );
}

async function activeManagersOf(ids: string[]): Promise<string[]> {
  const rows = await db
    .select({
      userId: staffSchema.staffMember.userId,
      revokedAt: staffSchema.staffMember.revokedAt,
    })
    .from(staffSchema.staffMember)
    .where(inArray(staffSchema.staffMember.userId, ids));

  return rows.filter((r) => r.revokedAt === null).map((r) => r.userId);
}

async function withOnlyProbeManagers(work: () => Promise<void>): Promise<void> {
  const otherManagers = await db
    .select({ userId: staffSchema.staffMember.userId })
    .from(staffSchema.staffMember)
    .where(eq(staffSchema.staffMember.role, "manager"));
  const parked = otherManagers.map((row) => row.userId).filter((id) => !probeIds.includes(id));

  if (parked.length > 0) {
    await db
      .update(staffSchema.staffMember)
      .set({ role: "auditor" })
      .where(inArray(staffSchema.staffMember.userId, parked));
  }

  try {
    await work();
  } finally {
    if (parked.length > 0) {
      await db
        .update(staffSchema.staffMember)
        .set({ role: "manager" })
        .where(inArray(staffSchema.staffMember.userId, parked));
    }
  }
}

function staffService(listed: string[] = []): StaffService {
  return new StaffService(
    di.IStaffStore,
    di.IAdminUserStore,
    di.IOutboxRepository,
    di.ITransactionService,
    { PLATFORM_ADMIN_IDS: listed },
  );
}

async function resetManagers(ids: string[]): Promise<void> {
  await db.delete(staffSchema.staffMember).where(inArray(staffSchema.staffMember.userId, probeIds));
  await db
    .delete(outboxSchema.outboxEvent)
    .where(inArray(outboxSchema.outboxEvent.aggregateId, probeIds));
  await db
    .update(authSchema.user)
    .set({ banned: false, banExpires: null, pendingDeletionUntil: null })
    .where(inArray(authSchema.user.id, probeIds));
  if (ids.length === 0) return;

  await db
    .insert(staffSchema.staffMember)
    .values(ids.map((userId) => ({ userId, role: "manager", source: "console" })));
}

async function proveLastManagerHolds(): Promise<void> {
  const service = staffService();

  for (let round = 1; round <= ROUNDS; round += 1) {
    await db
      .delete(staffSchema.staffMember)
      .where(inArray(staffSchema.staffMember.userId, [managerA, managerB]));
    await db
      .delete(outboxSchema.outboxEvent)
      .where(inArray(outboxSchema.outboxEvent.aggregateId, [managerA, managerB]));
    await db
      .insert(staffSchema.staffMember)
      .values(
        [managerA, managerB].map((userId) => ({ userId, role: "manager", source: "console" })),
      );

    const outcomes = await Promise.all([
      service.revoke({ actorUserId: managerA, targetUserId: managerB }),
      service.revoke({ actorUserId: managerB, targetUserId: managerA }),
    ]);

    const succeeded = outcomes.filter((r) => r.isSuccess).length;
    const refused = outcomes.filter(
      (r) => r.isFailure && r.getError().code === "ADMIN_STAFF_LAST_MANAGER_FORBIDDEN",
    ).length;
    const remaining = await activeManagersOf([managerA, managerB]);
    const events =
      (await staffEvents(managerA, EventTypes.ADMIN_STAFF_REVOKED)) +
      (await staffEvents(managerB, EventTypes.ADMIN_STAFF_REVOKED));
    const loser = remaining[0] === managerA ? managerB : managerA;

    console.log(`[2.${round}] two managers revoke each other ->`, {
      succeeded,
      refused,
      remaining,
    });
    check("exactly one of the two revocations wins", succeeded === 1 && refused === 1);
    check("one manager remains", remaining.length === 1);
    check("only the winning revocation is announced", events === 1);
    check(
      "the revoked member's mirror role is written with the row",
      (await mirrorRole(loser)) === "user",
    );
  }
}

async function isBanned(userId: string): Promise<boolean> {
  const [row] = await db
    .select({ banned: authSchema.user.banned })
    .from(authSchema.user)
    .where(eq(authSchema.user.id, userId));

  return row?.banned === true;
}

const fullPermissions = ["users.moderate", "staff.manage"] as const;

function banWrite(userId: string) {
  return async () => {
    await db.update(authSchema.user).set({ banned: true }).where(eq(authSchema.user.id, userId));

    return Result.ok<void, never>(undefined);
  };
}

async function proveBanGuardHolds(): Promise<void> {
  const service = staffService();

  for (let round = 1; round <= ROUNDS; round += 1) {
    await resetManagers([managerA, managerB]);

    const outcomes = await Promise.all([
      service.moderateBan(
        { actorPermissions: fullPermissions, targetUserId: managerB },
        banWrite(managerB),
      ),
      service.moderateBan(
        { actorPermissions: fullPermissions, targetUserId: managerA },
        banWrite(managerA),
      ),
    ]);
    const succeeded = outcomes.filter((r) => r.isSuccess).length;
    const refused = outcomes.filter(
      (r) => r.isFailure && r.getError().code === "ADMIN_STAFF_LAST_MANAGER_FORBIDDEN",
    ).length;
    const banned = [await isBanned(managerA), await isBanned(managerB)].filter(Boolean).length;

    console.log(`[4.${round}] two managers ban each other ->`, { succeeded, refused, banned });
    check("exactly one of the two bans wins", succeeded === 1 && refused === 1 && banned === 1);
  }

  await resetManagers([managerA, managerB]);
  await db.update(authSchema.user).set({ banned: true }).where(eq(authSchema.user.id, managerA));
  check(
    "a banned manager does not count: the other one cannot be revoked",
    (await service.revoke({ actorUserId: plainUser, targetUserId: managerB })).isFailure,
  );

  await db
    .update(authSchema.user)
    .set({ banExpires: new Date(Date.now() - 1000) })
    .where(eq(authSchema.user.id, managerA));
  check(
    "a manager whose ban has expired counts again",
    (await service.revoke({ actorUserId: plainUser, targetUserId: managerB })).isSuccess,
  );
}

async function proveModerationTarget(): Promise<void> {
  await resetManagers([managerA]);
  const support = { actorPermissions: ["users.moderate"] as const };
  const service = staffService([listedId]);
  const allowed = async () => Result.ok<void, never>(undefined);

  const onManager = await service.moderate({ ...support, targetUserId: managerA }, allowed);
  const onListed = await service.moderate({ ...support, targetUserId: listedId }, allowed);
  const onPlain = await service.moderate({ ...support, targetUserId: plainUser }, allowed);
  const banListed = await service.moderateBan({ ...support, targetUserId: listedId }, allowed);

  check(
    "support cannot act on a manager or a listed id, and can on a plain user",
    onManager.isFailure &&
      onManager.getError().code === "ADMIN_USER_STAFF_TARGET_FORBIDDEN" &&
      onListed.isFailure &&
      banListed.isFailure &&
      onPlain.isSuccess,
  );
}

async function proveOverrides(): Promise<void> {
  const service = staffService();
  await resetManagers([managerA, managerB]);

  const denyManage = (targetUserId: string, actorUserId: string) =>
    service.setOverride({
      actorUserId,
      targetUserId,
      permission: "staff.manage",
      effect: "deny",
      expiresAt: Option.none(),
    });

  const racing = await Promise.all([
    denyManage(managerA, managerB),
    denyManage(managerB, managerA),
  ]);
  check(
    "two managers denying each other staff management leave one holder",
    racing.filter((result) => result.isSuccess).length === 1,
  );

  const [held] = await db
    .select({ userId: staffSchema.staffPermissionOverride.userId })
    .from(staffSchema.staffPermissionOverride)
    .where(inArray(staffSchema.staffPermissionOverride.userId, [managerA, managerB]));
  const denied = held?.userId ?? managerA;
  const holder = denied === managerA ? managerB : managerA;
  const lastHolderRevoked = await service.revoke({ actorUserId: plainUser, targetUserId: holder });
  check(
    "a manager denied staff management does not count as the last manager's backup",
    lastHolderRevoked.isFailure &&
      lastHolderRevoked.getError().code === "ADMIN_STAFF_LAST_MANAGER_FORBIDDEN",
  );

  const live = await di.IStaffStore.listLiveOverrides(denied);
  const [override] = live.isSuccess ? live.getValue() : [];
  const removed = await service.removeOverride({
    actorUserId: holder,
    targetUserId: denied,
    overrideId: override?.id ?? "",
  });
  check("removing the denial gives the backup back", removed.isSuccess);
  const afterRemoval = await di.IStaffStore.listLiveOverrides(denied);
  check(
    "a removed override is no longer live",
    afterRemoval.isSuccess && afterRemoval.getValue().length === 0,
  );

  const foreign = await service.removeOverride({
    actorUserId: denied,
    targetUserId: holder,
    overrideId: override?.id ?? "",
  });
  check(
    "an override id of another person answers not found",
    foreign.isFailure && foreign.getError().code === "ADMIN_STAFF_OVERRIDE_NOT_FOUND",
  );

  await openImpersonation(holder);
  const denyImpersonation = await service.setOverride({
    actorUserId: denied,
    targetUserId: holder,
    permission: "users.impersonate",
    effect: "deny",
    expiresAt: Option.some(new Date(Date.now() + 60_000)),
  });
  check("a denial with an expiry is written", denyImpersonation.isSuccess);
  check(
    "a denial of impersonation ends the sessions they impersonate through",
    (await impersonationSessionsOf(holder)) === 0,
  );

  const [event] = await db
    .select({ payload: outboxSchema.outboxEvent.payload })
    .from(outboxSchema.outboxEvent)
    .where(
      and(
        eq(outboxSchema.outboxEvent.aggregateId, holder),
        eq(outboxSchema.outboxEvent.eventType, EventTypes.ADMIN_STAFF_OVERRIDE_SET),
      ),
    );
  check("the write announces its event in the same transaction", event !== undefined);
}

async function proveWipeRevokes(): Promise<void> {
  await resetManagers([leaver, managerA]);
  await db.insert(staffSchema.staffPermissionOverride).values({
    id: crypto.randomUUID(),
    userId: leaver,
    permission: "audit.read",
    effect: "grant",
  });
  await db
    .update(authSchema.user)
    .set({ role: "admin", pendingDeletionUntil: new Date(Date.now() - 1000) })
    .where(eq(authSchema.user.id, leaver));

  await openImpersonation(leaver);

  const wiped = await di.RgpdService.executeAccountWipe({ userId: leaver });
  console.log("[5] wipe ->", wiped.isFailure ? wiped.getError() : "success");
  check("the wipe of a manager succeeds", wiped.isSuccess);

  const [row] = await db
    .select({ revokedAt: staffSchema.staffMember.revokedAt })
    .from(staffSchema.staffMember)
    .where(eq(staffSchema.staffMember.userId, leaver));
  const overrides = await db
    .select({ revokedAt: staffSchema.staffPermissionOverride.revokedAt })
    .from(staffSchema.staffPermissionOverride)
    .where(eq(staffSchema.staffPermissionOverride.userId, leaver));
  check("the wipe revokes the staff row", row?.revokedAt instanceof Date);
  check(
    "the wipe revokes the overrides",
    overrides.length === 1 && overrides.every((o) => o.revokedAt !== null),
  );
  check(
    "the wipe deletes the sessions they impersonate through",
    (await impersonationSessionsOf(leaver)) === 0,
  );
  check("the wipe resets the mirror", (await mirrorRole(leaver)) === "user");

  const [event] = await db
    .select({ payload: outboxSchema.outboxEvent.payload })
    .from(outboxSchema.outboxEvent)
    .where(
      and(
        eq(outboxSchema.outboxEvent.aggregateId, leaver),
        eq(outboxSchema.outboxEvent.eventType, EventTypes.ADMIN_STAFF_REVOKED),
      ),
    );
  check(
    "the wipe announces the revocation with the member as actor",
    JSON.stringify(event?.payload).includes(`"actorUserId":"${leaver}"`),
  );

  check(
    "the wiped manager no longer counts",
    (await staffService().revoke({ actorUserId: plainUser, targetUserId: managerA })).isFailure,
  );

  await resetManagers([ghost, managerA]);
  await db
    .update(authSchema.user)
    .set({ deletedAt: new Date() })
    .where(eq(authSchema.user.id, ghost));
  check(
    "an active row on a deleted account does not count either",
    (await staffService().revoke({ actorUserId: plainUser, targetUserId: managerA })).isFailure,
  );
  await db.update(authSchema.user).set({ deletedAt: null }).where(eq(authSchema.user.id, ghost));
}

async function proveDeletionRefused(): Promise<void> {
  await resetManagers([managerA]);
  await db.insert(authSchema.account).values({
    id: crypto.randomUUID(),
    accountId: managerA,
    providerId: "credential",
    userId: managerA,
    password: await hashPassword(PASSWORD),
  });

  const refused = await di.RgpdService.requestAccountDeletion({
    userId: managerA,
    password: PASSWORD,
  });
  console.log("[6] last manager asks deletion ->", refused.isFailure ? refused.getError() : "ok");
  check(
    "the last manager cannot request deletion",
    refused.isFailure && refused.getError().code === "ACCOUNT_DELETION_LAST_MANAGER_FORBIDDEN",
  );

  const [state] = await db
    .select({ pending: authSchema.user.pendingDeletionUntil })
    .from(authSchema.user)
    .where(eq(authSchema.user.id, managerA));
  check("the refusal marks nothing", state?.pending === null);

  await db
    .insert(staffSchema.staffMember)
    .values({ userId: managerB, role: "manager", source: "console" });
  await db
    .update(authSchema.user)
    .set({ pendingDeletionUntil: new Date(Date.now() + 60_000) })
    .where(eq(authSchema.user.id, managerB));
  const stillRefused = await di.RgpdService.requestAccountDeletion({
    userId: managerA,
    password: PASSWORD,
  });
  check("a manager about to leave does not count as remaining", stillRefused.isFailure);
}

async function proveReviveAndRegrant(): Promise<void> {
  await db
    .insert(staffSchema.staffMember)
    .values({ userId: revivedId, role: "support", source: "console", revokedAt: new Date() });
  const service = new StaffAccessService(
    di.IStaffStore,
    di.IOutboxRepository,
    di.ITransactionService,
    { PLATFORM_ADMIN_IDS: [revivedId], PLATFORM_ADMIN_REQUIRE_MFA: false },
  );
  const user = { id: revivedId, twoFactorEnabled: false };

  await Promise.all(
    Array.from({ length: RACERS }, () => service.gate(user, { impersonatedBy: null })),
  );
  const [revived] = await db
    .select({
      role: staffSchema.staffMember.role,
      source: staffSchema.staffMember.source,
      revokedAt: staffSchema.staffMember.revokedAt,
    })
    .from(staffSchema.staffMember)
    .where(eq(staffSchema.staffMember.userId, revivedId));
  console.log("[7] revived ->", revived);
  check(
    "a listed id's revoked row revives as an env manager",
    revived?.role === "manager" && revived.source === "env" && revived.revokedAt === null,
  );
  check(
    "the revival is announced once however many requests race",
    (await staffEvents(revivedId, EventTypes.ADMIN_STAFF_ADDED)) === 1,
  );

  await service.gate(user, { impersonatedBy: null });
  check(
    "a later request writes and announces nothing",
    (await staffEvents(revivedId, EventTypes.ADMIN_STAFF_ADDED)) === 1,
  );

  await db
    .insert(staffSchema.staffMember)
    .values({ userId: formerListed, role: "manager", source: "env" });
  const regranted = await staffService().assignRole({
    actorUserId: managerA,
    targetUserId: formerListed,
    role: "manager",
  });
  const [flipped] = await db
    .select({ source: staffSchema.staffMember.source })
    .from(staffSchema.staffMember)
    .where(eq(staffSchema.staffMember.userId, formerListed));
  check(
    "re-granting a de-listed id flips the source and announces it",
    regranted.isSuccess &&
      flipped?.source === "console" &&
      (await staffEvents(formerListed, EventTypes.ADMIN_STAFF_ADDED)) === 1,
  );
}

async function proveImpersonatorRecheck(): Promise<void> {
  await db
    .insert(staffSchema.staffMember)
    .values({ userId: supportActor, role: "support", source: "console" });
  const service = di.StaffAccessService;

  check("a support member holds impersonation", await service.impersonatorHolds(supportActor));

  await db
    .update(staffSchema.staffMember)
    .set({ role: "auditor" })
    .where(eq(staffSchema.staffMember.userId, supportActor));
  check("a demoted one does not", !(await service.impersonatorHolds(supportActor)));

  await db
    .update(staffSchema.staffMember)
    .set({ role: "support", revokedAt: new Date() })
    .where(eq(staffSchema.staffMember.userId, supportActor));
  check("a revoked one does not", !(await service.impersonatorHolds(supportActor)));
}

async function impersonationSessionsOf(impersonator: string): Promise<number> {
  const rows = await db
    .select({ id: authSchema.session.id })
    .from(authSchema.session)
    .where(eq(authSchema.session.impersonatedBy, impersonator));

  return rows.length;
}

async function openImpersonation(impersonator: string): Promise<void> {
  await db.insert(authSchema.session).values({
    id: crypto.randomUUID(),
    token: crypto.randomUUID(),
    userId: plainUser,
    impersonatedBy: impersonator,
    expiresAt: new Date(Date.now() + 60_000),
    updatedAt: new Date(),
  });
}

async function proveImpersonationsEnd(): Promise<void> {
  const service = staffService();
  await db
    .update(staffSchema.staffMember)
    .set({ role: "support", revokedAt: null })
    .where(eq(staffSchema.staffMember.userId, supportActor));
  await db
    .insert(staffSchema.staffMember)
    .values({ userId: managerB, role: "manager", source: "console" });
  await openImpersonation(supportActor);

  await service.assignRole({
    actorUserId: managerB,
    targetUserId: supportActor,
    role: "manager",
  });
  console.log(
    "[8] sessions after a role keeping the permission ->",
    await impersonationSessionsOf(supportActor),
  );
  check(
    "a role change that keeps the permission keeps the session",
    (await impersonationSessionsOf(supportActor)) === 1,
  );

  await service.assignRole({
    actorUserId: managerB,
    targetUserId: supportActor,
    role: "auditor",
  });
  check(
    "a role change that loses the permission deletes the session",
    (await impersonationSessionsOf(supportActor)) === 0,
  );

  await openImpersonation(supportActor);
  await service.revoke({ actorUserId: managerB, targetUserId: supportActor });
  check("a revocation deletes the session", (await impersonationSessionsOf(supportActor)) === 0);

  await db
    .update(staffSchema.staffMember)
    .set({ role: "support", revokedAt: null })
    .where(eq(staffSchema.staffMember.userId, supportActor));
  await db
    .update(authSchema.user)
    .set({ banned: true })
    .where(eq(authSchema.user.id, supportActor));
  check(
    "a banned impersonator no longer holds the permission",
    !(await di.StaffAccessService.impersonatorHolds(supportActor)),
  );
}

async function refusedByCheck(write: () => Promise<unknown>): Promise<boolean> {
  try {
    await write();

    return false;
  } catch (err) {
    return JSON.stringify(err, Object.getOwnPropertyNames(err)).includes("_check");
  }
}

async function proveCheckConstraints(): Promise<void> {
  check(
    "the database refuses an unknown source",
    await refusedByCheck(() =>
      db
        .insert(staffSchema.staffMember)
        .values({ userId: ghost, role: "manager", source: "legacy" }),
    ),
  );

  await db
    .insert(staffSchema.staffMember)
    .values({ userId: ghost, role: "support", source: "console" })
    .onConflictDoNothing();
  check(
    "the database refuses an unknown effect",
    await refusedByCheck(() =>
      db.insert(staffSchema.staffPermissionOverride).values({
        id: crypto.randomUUID(),
        userId: ghost,
        permission: "audit.read",
        effect: "maybe",
      }),
    ),
  );
}

async function proveMigrationDataStep(): Promise<void> {
  const migration = readFileSync(
    join(import.meta.dir, "../../../packages/drizzle/migrations/0028_staff_member.sql"),
    "utf8",
  );
  const dataStep = migration
    .split("--> statement-breakpoint")
    .map((statement) => statement.trim())
    .find((statement) => statement.startsWith('INSERT INTO "staff_member"'));

  if (!dataStep) {
    check("the migration carries its data step", false);
    return;
  }

  await db.execute(sql.raw(dataStep));

  const [legacy] = await db
    .select({ role: staffSchema.staffMember.role, source: staffSchema.staffMember.source })
    .from(staffSchema.staffMember)
    .where(eq(staffSchema.staffMember.userId, legacyAdmin));
  const [plain] = await db
    .select({ role: staffSchema.staffMember.role })
    .from(staffSchema.staffMember)
    .where(eq(staffSchema.staffMember.userId, plainUser));

  const [deleted] = await db
    .select({ role: staffSchema.staffMember.role })
    .from(staffSchema.staffMember)
    .where(eq(staffSchema.staffMember.userId, legacyDeleted));

  console.log("[3] data step ->", { legacy, plain, deleted });
  check("a deleted admin gets no row", deleted === undefined);
  check(
    "an existing role = admin user gets a manager row",
    legacy?.role === "manager" && legacy.source === "migration",
  );
  check("a plain user gets no row", plain === undefined);

  const access = await di.StaffAccessService.read(
    { id: legacyAdmin, twoFactorEnabled: true },
    { impersonatedBy: null },
  );
  check(
    "the migrated user keeps access through the row",
    access.isSuccess && access.getValue().unwrap().role === "manager",
  );

  const refused = await di.StaffAccessService.read(
    { id: plainUser, twoFactorEnabled: true },
    { impersonatedBy: null },
  );
  check("a plain user stays refused", refused.isSuccess && refused.getValue().isNone());
}

async function main(): Promise<void> {
  await cleanup();
  await seed();

  await proveBootstrapEmitsOnce();
  await withOnlyProbeManagers(async () => {
    await proveLastManagerHolds();
    await proveBanGuardHolds();
    await proveModerationTarget();
    await proveOverrides();
    await proveWipeRevokes();
    await proveDeletionRefused();
  });
  await resetManagers([]);
  await proveReviveAndRegrant();
  await proveImpersonatorRecheck();
  await proveImpersonationsEnd();
  await proveCheckConstraints();
  await proveMigrationDataStep();

  await cleanup();

  if (checks.failures > 0) {
    console.error(`\n${checks.failures} check(s) failed`);
    process.exit(1);
  }
  console.log(
    "\nAll assertions passed, the bootstrap, the guards and the wipe hold against a real database.",
  );
  process.exit(0);
}

main().catch(async (err) => {
  console.error("check-admin-staff crashed:", err);
  await cleanup().catch(() => {});
  process.exit(1);
});
