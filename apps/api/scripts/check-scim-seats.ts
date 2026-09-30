/**
 * Proves against a real Postgres that concurrent SCIM provisionings cannot push an
 * organization past its seat cap.
 *
 * The projection counts members, then inserts one, inside the plugin's transaction.
 * Counted on another connection and without a lock, five directories provisioning at
 * once all see the same free seat and all take it. Only concurrent transactions on a
 * real database can show that; a mocked adapter serialises them by construction.
 * The gap between the count and the insert is widened on purpose, so the race is
 * hit every run instead of by luck.
 */

import { setTimeout as sleep } from "node:timers/promises";
import { checkRecorder } from "./check-harness";
import { requireLocalDatabase } from "./require-local-database";

requireLocalDatabase("check-scim-seats");

import { getCurrentAdapter, runWithTransaction } from "@better-auth/core/context";
import type { SCIMTransactionContext } from "@better-auth/scim";
import { authSchema, db, eq, inArray, multiTenantSchema } from "@packages/drizzle";
import { auth, scimMembershipDeps } from "../src/auth";
import { scimMembershipProjection } from "../src/shared/auth/scim-membership";
import { ENTITLEMENTS } from "../src/shared/entitlements";

const CONCURRENT_PROVISIONINGS = 5;
const RACE_WINDOW_MS = 150;
const organizationId = `check-scim-seats-${crypto.randomUUID()}`;
const userIds: string[] = [];

const checks = checkRecorder();
const { check } = checks;

async function membersOf(): Promise<number> {
  const rows = await db
    .select({ id: multiTenantSchema.member.id })
    .from(multiTenantSchema.member)
    .where(eq(multiTenantSchema.member.organizationId, organizationId));

  return rows.length;
}

async function cleanup(): Promise<void> {
  await db
    .delete(multiTenantSchema.organization)
    .where(eq(multiTenantSchema.organization.id, organizationId));
  if (userIds.length > 0)
    await db.delete(authSchema.user).where(inArray(authSchema.user.id, userIds));
}

async function seedUser(): Promise<string> {
  const id = `check-scim-seats-${crypto.randomUUID()}`;
  await db
    .insert(authSchema.user)
    .values({ id, name: "Seat Probe", email: `${id}@example.com`, emailVerified: true });
  userIds.push(id);
  return id;
}

async function main(): Promise<void> {
  const ctx = await auth.$context;
  const cap = ENTITLEMENTS.free.maxMembers ?? 0;

  await cleanup();
  await db.insert(multiTenantSchema.organization).values({
    id: organizationId,
    name: "Seat Probe",
    slug: organizationId,
  });
  const ownerId = await seedUser();
  await db.insert(multiTenantSchema.member).values({
    id: crypto.randomUUID(),
    organizationId,
    userId: ownerId,
    role: "owner",
    createdAt: new Date(),
  });

  // Free plan: a seat cap, and the SSO entitlement granted so only the cap decides.
  const projection = scimMembershipProjection({
    ...scimMembershipDeps,
    hasSsoEntitlement: async () => true,
    seatCapFor: async (orgId) => {
      const seats = await scimMembershipDeps.seatCapFor(orgId);
      await sleep(RACE_WINDOW_MS);
      return seats;
    },
  });
  const provisioned = await Promise.all(
    Array.from({ length: CONCURRENT_PROVISIONINGS }, async () => {
      const userId = await seedUser();
      return runWithTransaction(ctx.adapter, async () => {
        // The adapter is typed with this app's options, the callback with the default
        // ones: the same object at runtime, the plugin hands it over the same way.
        const database = (await getCurrentAdapter(
          ctx.adapter,
        )) as unknown as SCIMTransactionContext["database"];
        await projection.reconcileUser(
          { provisioningDomainId: organizationId, userId, active: true, sources: [], grants: [] },
          { database },
        );
      }).then(
        () => "added",
        (err: unknown) =>
          err instanceof Error && "status" in err ? String(err.status) : String(err),
      );
    }),
  );

  const members = await membersOf();
  console.log(
    `[1] ${CONCURRENT_PROVISIONINGS} concurrent provisionings, cap ${cap} ->`,
    provisioned,
    `members=${members}`,
  );
  check("the organization never exceeds its seat cap", members === cap, { members, cap });
  check(
    "every provisioning beyond the cap is refused",
    provisioned.filter((outcome) => outcome === "added").length === cap - 1,
  );

  await cleanup();

  if (checks.failures > 0) {
    console.error(`\n${checks.failures} check(s) failed`);
    process.exit(1);
  }
  console.log("\nAll assertions passed, concurrent SCIM provisionings respect the seat cap.");
  process.exit(0);
}

main().catch(async (err) => {
  console.error("check-scim-seats crashed:", err);
  await cleanup().catch(() => {});
  process.exit(1);
});
