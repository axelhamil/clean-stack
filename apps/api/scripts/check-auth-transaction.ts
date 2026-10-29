/**
 * Proves against a real Postgres that the database hooks BetterAuth runs inside its
 * own transactions write on that transaction, not on another connection.
 *
 * SSO sign-in and SCIM provisioning create a user and its session in one transaction
 * (`runWithTransaction`), and `session.create.before` bootstraps the Personal
 * organization of that user. On a second connection the `member` insert references a
 * user that is not committed yet, and fails its foreign key: the first SSO sign-in of
 * every new user fails. A mocked adapter cannot see that, only two real connections
 * can.
 */

import { checkRecorder } from "./check-harness";
import { requireLocalDatabase } from "./require-local-database";

requireLocalDatabase("check-auth-transaction");

import { runWithTransaction } from "@better-auth/core/context";
import { Result } from "@packages/ddd-kit";
import {
  and,
  authSchema,
  type DbClient,
  db,
  eq,
  inArray,
  multiTenantSchema,
  or,
  outboxSchema,
  resolveExecutor,
  sql,
  type Transaction,
} from "@packages/drizzle";
import { EventTypes } from "@packages/events";
import { auth } from "../src/auth";
import { di } from "../src/container";

// The provisioning source the SSO plugin passes, so the probe goes through the same
// creation seam as a first SSO sign-in.
const SSO_SOURCE = {
  method: "sso-oidc",
  sso: { providerId: "check-auth-transaction", profile: {} },
} as const;

const checks = checkRecorder();
const { check } = checks;
const createdUserIds: string[] = [];

async function personalOrgIdsOf(userId: string): Promise<string[]> {
  const rows = await db
    .select({ organizationId: multiTenantSchema.member.organizationId })
    .from(multiTenantSchema.member)
    .where(eq(multiTenantSchema.member.userId, userId));

  return rows.map((row) => row.organizationId);
}

async function outboxRowsOf(organizationIds: string[]): Promise<number> {
  if (organizationIds.length === 0) return 0;

  const rows = await db
    .select({ id: outboxSchema.outboxEvent.id })
    .from(outboxSchema.outboxEvent)
    .where(inArray(outboxSchema.outboxEvent.organizationId, organizationIds));

  return rows.length;
}

async function personalOrgEventsOf(userId: string): Promise<number> {
  const { eventType, payload } = outboxSchema.outboxEvent;
  const rows = await db
    .select({ id: outboxSchema.outboxEvent.id })
    .from(outboxSchema.outboxEvent)
    .where(
      and(
        inArray(eventType, [EventTypes.ORG_CREATED, EventTypes.ORG_MEMBER_JOINED]),
        or(eq(sql`${payload}->>'userId'`, userId), eq(sql`${payload}->>'ownerUserId'`, userId)),
      ),
    );

  return rows.length;
}

async function userExists(userId: string): Promise<boolean> {
  const rows = await db
    .select({ id: authSchema.user.id })
    .from(authSchema.user)
    .where(eq(authSchema.user.id, userId));

  return rows.length === 1;
}

async function backendPid(executor: DbClient | Transaction): Promise<number | undefined> {
  const { rows } = await executor.execute<{ pid: number }>(sql`select pg_backend_pid() as pid`);

  return rows[0]?.pid;
}

async function cleanup(): Promise<void> {
  for (const userId of createdUserIds) {
    const orgIds = await personalOrgIdsOf(userId);
    await db
      .delete(outboxSchema.outboxEvent)
      .where(eq(outboxSchema.outboxEvent.aggregateId, userId));
    if (orgIds.length > 0) {
      await db
        .delete(outboxSchema.outboxEvent)
        .where(inArray(outboxSchema.outboxEvent.organizationId, orgIds));
    }
    await db.delete(authSchema.user).where(eq(authSchema.user.id, userId));
    if (orgIds.length > 0) {
      await db
        .delete(multiTenantSchema.organization)
        .where(inArray(multiTenantSchema.organization.id, orgIds));
    }
  }
}

async function main(): Promise<void> {
  const ctx = await auth.$context;
  const newUser = () => ({
    email: `check-auth-tx-${crypto.randomUUID()}@example.com`,
    name: "Auth Transaction Probe",
    emailVerified: true,
  });

  const committed = await runWithTransaction(ctx.adapter, async () => {
    const user = await ctx.internalAdapter.createUser(newUser(), SSO_SOURCE);
    createdUserIds.push(user.id);
    const session = await ctx.internalAdapter.createSession(user.id, false);
    return { user, session };
  }).catch((err: unknown) => err);

  const ok = !(committed instanceof Error);
  console.log("[1] user + session in one transaction ->", ok ? "committed" : String(committed));
  check("a session can be created for a user created in the same transaction", ok);

  if (ok) {
    const { user, session } = committed as {
      user: { id: string };
      session: { activeOrganizationId?: string | null };
    };
    const orgIds = await personalOrgIdsOf(user.id);
    check("the new user owns exactly one organization", orgIds.length === 1, orgIds);
    check(
      "the session is scoped to that organization",
      session.activeOrganizationId !== undefined && session.activeOrganizationId === orgIds[0],
    );
    check("org.created and org.member.joined were committed", (await outboxRowsOf(orgIds)) === 2);
  }

  let rolledBackUserId: string | undefined;
  const probe = new Error("probe: abort after the session");
  const aborted = await runWithTransaction(ctx.adapter, async () => {
    const user = await ctx.internalAdapter.createUser(newUser(), SSO_SOURCE);
    rolledBackUserId = user.id;
    createdUserIds.push(user.id);
    await ctx.internalAdapter.createSession(user.id, false);
    throw probe;
  }).catch((err: unknown) => err);

  console.log(
    "[2] aborted transaction ->",
    aborted === probe ? "the probe error" : String(aborted),
  );
  check("the transaction was aborted by the probe, not by a hook", aborted === probe);
  if (rolledBackUserId) {
    const orgIds = await personalOrgIdsOf(rolledBackUserId);
    check("no membership survives the rollback", orgIds.length === 0, orgIds);
    const [user] = await db
      .select({ id: authSchema.user.id })
      .from(authSchema.user)
      .where(eq(authSchema.user.id, rolledBackUserId));
    check("the user itself was rolled back", user === undefined);
    check(
      "an event emitted in a databaseHook is rolled back with the hook write",
      (await personalOrgEventsOf(rolledBackUserId)) === 0,
    );
  }

  const appFailure = Result.fail("probe: the app run fails after BetterAuth committed");
  let appPid: number | undefined;
  let authPid: number | undefined;
  let nestedUserId: string | undefined;
  let visibleBeforeAppCommit = false;
  const appRun = await di.ITransactionService.run(async () => {
    appPid = await backendPid(resolveExecutor());
    const user = await runWithTransaction(ctx.adapter, async () => {
      authPid = await backendPid(resolveExecutor());

      return ctx.internalAdapter.createUser(newUser(), SSO_SOURCE);
    });
    nestedUserId = user.id;
    createdUserIds.push(user.id);
    visibleBeforeAppCommit = await userExists(user.id);

    return appFailure;
  });
  console.log("[3] BetterAuth transaction inside an app run ->", { appPid, authPid });
  check(
    "a BetterAuth transaction opened inside an app run commits on its own connection",
    appRun === appFailure &&
      authPid !== undefined &&
      authPid !== appPid &&
      visibleBeforeAppCommit &&
      nestedUserId !== undefined &&
      (await userExists(nestedUserId)),
  );

  await cleanup();

  if (checks.failures > 0) {
    console.error(`\n${checks.failures} check(s) failed`);
    process.exit(1);
  }
  console.log("\nAll assertions passed, hooks write on BetterAuth's own transaction.");
  process.exit(0);
}

main().catch(async (err) => {
  console.error("check-auth-transaction crashed:", err);
  await cleanup().catch(() => {});
  process.exit(1);
});
