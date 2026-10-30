/**
 * Proves against a real Postgres what mocks cannot: the bootstrap insert of a listed id
 * announces once however many first requests race, the last-manager guard holds when two
 * managers revoke each other at the same time, and the migration's data step gives an existing
 * `role = admin` user a manager row. The lock and the `ON CONFLICT` live in SQL, a mocked
 * transaction evaluates neither. Creates and removes its own probe users.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  and,
  authSchema,
  db,
  eq,
  inArray,
  outboxSchema,
  sql,
  staffSchema,
} from "@packages/drizzle";
import { EventTypes } from "@packages/events";
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
const probeIds = [listedId, managerA, managerB, legacyAdmin, plainUser];

const checks = checkRecorder();
const { check } = checks;

async function cleanup(): Promise<void> {
  await db
    .delete(outboxSchema.outboxEvent)
    .where(inArray(outboxSchema.outboxEvent.aggregateId, probeIds));
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
      role: id === legacyAdmin ? "admin" : "user",
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

async function proveLastManagerHolds(): Promise<void> {
  const otherManagers = await db
    .select({ userId: staffSchema.staffMember.userId })
    .from(staffSchema.staffMember)
    .where(eq(staffSchema.staffMember.role, "manager"));
  const parked = otherManagers
    .map((row) => row.userId)
    .filter((id) => id !== managerA && id !== managerB);

  if (parked.length > 0) {
    await db
      .update(staffSchema.staffMember)
      .set({ role: "auditor" })
      .where(inArray(staffSchema.staffMember.userId, parked));
  }

  try {
    const service = new StaffService(
      di.IStaffStore,
      di.IAdminUserStore,
      di.IOutboxRepository,
      di.ITransactionService,
      [],
    );

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
  } finally {
    if (parked.length > 0) {
      await db
        .update(staffSchema.staffMember)
        .set({ role: "manager" })
        .where(inArray(staffSchema.staffMember.userId, parked));
    }
  }
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

  console.log("[3] data step ->", { legacy, plain });
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
  await proveLastManagerHolds();
  await proveMigrationDataStep();

  await cleanup();

  if (checks.failures > 0) {
    console.error(`\n${checks.failures} check(s) failed`);
    process.exit(1);
  }
  console.log(
    "\nAll assertions passed, the bootstrap and the last-manager guard hold under concurrency.",
  );
  process.exit(0);
}

main().catch(async (err) => {
  console.error("check-admin-staff crashed:", err);
  await cleanup().catch(() => {});
  process.exit(1);
});
