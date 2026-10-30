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
 *
 * The behavioural signals have the same blind spot: an event emitted inside that
 * transaction is rolled back by the refusal that follows it, and whether a request
 * counts as a sign-in depends on what the endpoint left in its context. So the
 * deny-list and the travel signal go through the real handler here, with the env set
 * by the first import, before anything parses it, and the visitor set through the request context.
 */

import "./check-auth-transaction.env";
import { checkRecorder, seedTwoFactor } from "./check-harness";
import { requireLocalDatabase } from "./require-local-database";

requireLocalDatabase("check-auth-transaction");

import { runWithTransaction } from "@better-auth/core/context";
import { createOTP } from "@better-auth/utils/otp";
import { Option, Result } from "@packages/ddd-kit";
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
import { TOTP_OPTIONS } from "../src/shared/auth/totp-options";
import { env } from "../src/shared/env";
import { runWithRequestContext } from "../src/shared/request-context";

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

const PROBE_IP = `check-${crypto.randomUUID()}`;
const PASSWORD = "check-auth-transaction-Password-1!";

function asVisitor<T>(country: string, fn: () => Promise<T>): Promise<T> {
  return runWithRequestContext(
    {
      requestId: "check-auth-transaction",
      clientIp: () => PROBE_IP,
      visitorGeo: () => ({ country: Option.some(country), asn: Option.none() }),
    },
    fn,
  );
}

function call(
  country: string,
  method: string,
  path: string,
  headers: Record<string, string> = {},
  body?: unknown,
): Promise<Response> {
  return asVisitor(country, () =>
    auth.handler(
      new Request(`${env.BETTER_AUTH_URL}/api/auth${path}`, {
        method,
        headers: { Origin: env.BETTER_AUTH_URL, "Content-Type": "application/json", ...headers },
        body: body === undefined ? undefined : JSON.stringify(body),
      }),
    ),
  );
}

async function eventsOfType(type: string, key: "ip" | "userId", value: string): Promise<number> {
  const { eventType, payload } = outboxSchema.outboxEvent;
  const rows = await db
    .select({ id: outboxSchema.outboxEvent.id })
    .from(outboxSchema.outboxEvent)
    .where(and(eq(eventType, type), eq(sql`${payload}->>${key}`, value)));

  return rows.length;
}

function cookiesOf(response: Response): Record<string, string> {
  const pairs = response.headers.getSetCookie().map((cookie) => cookie.split(";")[0]);

  return { Cookie: pairs.join("; ") };
}

async function cleanup(): Promise<void> {
  const { payload } = outboxSchema.outboxEvent;
  await db.delete(outboxSchema.outboxEvent).where(eq(sql`${payload}->>'ip'`, PROBE_IP));
  for (const userId of createdUserIds) {
    await db.delete(outboxSchema.outboxEvent).where(eq(sql`${payload}->>'userId'`, userId));
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

  const authContext = ctx;
  const seededUser = async () => {
    const user = await authContext.internalAdapter.createUser(newUser(), SSO_SOURCE);
    createdUserIds.push(user.id);

    return user;
  };
  const withPassword = (userId: string) =>
    authContext.password.hash(PASSWORD).then((password) =>
      authContext.internalAdapter.createAccount({
        userId,
        providerId: "credential",
        accountId: userId,
        password,
      }),
    );
  const totpNow = (secret: string) => createOTP(secret, TOTP_OPTIONS).totp();
  const secret = `check-auth-transaction-secret-${crypto.randomUUID()}`;
  const GEO_DENIED = EventTypes.SECURITY_GEO_DENIED;
  const TRAVEL = EventTypes.SECURITY_IMPOSSIBLE_TRAVEL_DETECTED;

  const callbacks: [method: string, path: string][] = [
    ["GET", "/sso/callback/check-auth-transaction?code=x&state=y"],
    ["POST", "/sso/saml2/sp/acs/check-auth-transaction"],
    ["GET", "/callback/github?code=x&state=y"],
  ];
  for (const [method, path] of callbacks) {
    const before = await eventsOfType(GEO_DENIED, "ip", PROBE_IP);
    const denied = await call("KP", method, path);
    const body = await denied.json();
    console.log(`[4] denied visitor on ${path} ->`, denied.status, body);
    check(`${path} refuses a denied visitor`, denied.status === 403);
    check(
      `${path} keeps its security.geo.denied event`,
      (await eventsOfType(GEO_DENIED, "ip", PROBE_IP)) === before + 1,
    );
  }

  const deniedEmail = newUser();
  const refusedUser = await asVisitor("KP", () =>
    runWithTransaction(authContext.adapter, () =>
      authContext.internalAdapter.createUser(deniedEmail, SSO_SOURCE),
    ),
  ).catch((err: unknown) => err);
  const [deniedRow] = await db
    .select({ id: authSchema.user.id })
    .from(authSchema.user)
    .where(eq(authSchema.user.email, deniedEmail.email));
  console.log("[5] first sign-up of a denied visitor ->", String(refusedUser));
  check("a first sign-up of a denied visitor is refused", refusedUser instanceof Error);
  check("a first sign-up of a denied visitor leaves no user row", deniedRow === undefined);

  let abortedUserId: string | undefined;
  const sessionRefused = await runWithTransaction(authContext.adapter, async () => {
    const user = await authContext.internalAdapter.createUser(newUser(), SSO_SOURCE);
    abortedUserId = user.id;
    createdUserIds.push(user.id);
    await asVisitor("KP", () => authContext.internalAdapter.createSession(user.id, false));
  }).catch((err: unknown) => err);
  console.log("[6] session refused in the SSO transaction ->", String(sessionRefused));
  check(
    "a session refused in the SSO transaction rolls its user back",
    sessionRefused instanceof Error &&
      abortedUserId !== undefined &&
      !(await userExists(abortedUserId)),
  );

  const disabling = await seededUser();
  await withPassword(disabling.id);
  await db
    .update(authSchema.user)
    .set({ twoFactorEnabled: true })
    .where(eq(authSchema.user.id, disabling.id));
  await seedTwoFactor(disabling.id, secret, true);
  const disablingSession = await authContext.internalAdapter.createSession(disabling.id, false);
  const disabled = await call(
    "KP",
    "POST",
    "/two-factor/disable",
    { Authorization: `Bearer ${disablingSession.token}` },
    { password: PASSWORD },
  );
  const [afterDisable] = await db
    .select({ enabled: authSchema.user.twoFactorEnabled })
    .from(authSchema.user)
    .where(eq(authSchema.user.id, disabling.id));
  console.log("[7] /two-factor/disable from a denied country ->", disabled.status);
  check("a session rotation is not refused by the deny-list", disabled.status === 200);
  check("two-factor is off and the caller knows it", afterDisable?.enabled === false);
  check(
    "user.mfa.disabled was emitted",
    (await eventsOfType(EventTypes.USER_MFA_DISABLED, "userId", disabling.id)) === 1,
  );
  check(
    "the rotation reports no travel",
    (await eventsOfType(TRAVEL, "userId", disabling.id)) === 0,
  );

  const enrolling = await seededUser();
  await seedTwoFactor(enrolling.id, secret, false);
  const enrollingSession = await authContext.internalAdapter.createSession(enrolling.id, false);
  const enrolled = await call(
    "KP",
    "POST",
    "/two-factor/verify-totp",
    { Authorization: `Bearer ${enrollingSession.token}` },
    { code: await totpNow(secret) },
  );
  console.log("[8] verify-totp enable branch from a denied country ->", enrolled.status);
  check("the enable branch of verify-totp is not refused", enrolled.status === 200);

  const signingIn = await seededUser();
  await withPassword(signingIn.id);
  await db
    .update(authSchema.user)
    .set({ twoFactorEnabled: true })
    .where(eq(authSchema.user.id, signingIn.id));
  await seedTwoFactor(signingIn.id, secret, true);
  await asVisitor("JP", () => authContext.internalAdapter.createSession(signingIn.id, false));
  await authContext.internalAdapter.createSession(signingIn.id, false);

  const credentials = { email: signingIn.email, password: PASSWORD };
  const challenge = await call("FR", "POST", "/sign-in/email", {}, credentials);
  const travelAtChallenge = await eventsOfType(TRAVEL, "userId", signingIn.id);
  const verified = await call("FR", "POST", "/two-factor/verify-totp", cookiesOf(challenge), {
    code: await totpNow(secret),
  });
  const travelAtCompletion = await eventsOfType(TRAVEL, "userId", signingIn.id);
  console.log("[9] 2FA sign-in ->", challenge.status, verified.status, {
    travelAtChallenge,
    travelAtCompletion,
  });
  check("the password step answers with a 2FA challenge", challenge.status === 200);
  check("the 2FA challenge reports no travel", travelAtChallenge === 0);
  check("the completed 2FA sign-in succeeds", verified.status === 200);
  check(
    "the completed sign-in reports one travel, past a session of unknown country",
    travelAtCompletion === 1,
  );

  const secondChallenge = await call("FR", "POST", "/sign-in/email", {}, credentials);
  const secondFactor = await call(
    "KP",
    "POST",
    "/two-factor/verify-totp",
    cookiesOf(secondChallenge),
    { code: await totpNow(secret) },
  );
  console.log("[10] second factor from a denied country ->", secondFactor.status);
  check("the second factor of a real sign-in stays covered", secondFactor.status === 403);

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
