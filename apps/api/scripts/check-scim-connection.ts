/**
 * Proves against a real Postgres that concurrent writes on one organization's SCIM
 * connection are serialised.
 *
 * Issuing a token lists the organization's connection, then creates or rotates it,
 * then revokes every other credential, across several plugin transactions. Run
 * twice at once, two first issues each see no connection and create one, and two
 * rotations each revoke the credential the other just issued: the organization ends
 * up with two connections, or with no working token it was ever shown. Only
 * concurrent calls against the real plugin tables can show it.
 */

import { checkRecorder } from "./check-harness";
import { requireLocalDatabase } from "./require-local-database";

requireLocalDatabase("check-scim-connection");

import {
  and,
  authSchema,
  billingSchema,
  db,
  eq,
  inArray,
  multiTenantSchema,
  outboxSchema,
  ssoSchema,
} from "@packages/drizzle";
import { EventTypes } from "@packages/events";
import { auth } from "../src/auth";
import { di } from "../src/container";
import { env } from "../src/shared/env";
import { ScimConnectionService } from "../src/shared/services/scim-connection.service";

const CONCURRENT_ISSUES = 4;
const organizationId = `check-scim-connection-${crypto.randomUUID()}`;
const actorUserId = `check-scim-connection-actor-${crypto.randomUUID()}`;
const verifiedDomain = `${organizationId}.example.com`;
const provisionedEmail = `member@${verifiedDomain}`;

const checks = checkRecorder();
const { check } = checks;

async function connectionsOf(): Promise<string[]> {
  const rows = await db
    .select({ id: ssoSchema.scimManagedConnection.id })
    .from(ssoSchema.scimManagedConnection)
    .where(eq(ssoSchema.scimManagedConnection.provisioningDomainId, organizationId));

  return rows.map((row) => row.id);
}

async function activeCredentialsOf(connectionIds: string[]): Promise<number> {
  if (connectionIds.length === 0) return 0;

  const rows = await db
    .select({ status: ssoSchema.scimManagedCredential.status })
    .from(ssoSchema.scimManagedCredential)
    .where(inArray(ssoSchema.scimManagedCredential.connectionRecordId, connectionIds));

  return rows.filter((row) => row.status === "active").length;
}

async function outboxEventsOf(eventType: string): Promise<number> {
  const rows = await db
    .select({ id: outboxSchema.outboxEvent.id })
    .from(outboxSchema.outboxEvent)
    .where(
      and(
        eq(outboxSchema.outboxEvent.organizationId, organizationId),
        eq(outboxSchema.outboxEvent.eventType, eventType),
      ),
    );

  return rows.length;
}

async function isProvisionedMember(): Promise<boolean> {
  const rows = await db
    .select({ id: multiTenantSchema.member.id })
    .from(multiTenantSchema.member)
    .innerJoin(authSchema.user, eq(authSchema.user.id, multiTenantSchema.member.userId))
    .where(
      and(
        eq(multiTenantSchema.member.organizationId, organizationId),
        eq(authSchema.user.email, provisionedEmail),
      ),
    );

  return rows.length > 0;
}

async function provisionMember(token: string): Promise<Response> {
  await db.insert(billingSchema.subscription).values({
    id: crypto.randomUUID(),
    plan: "business",
    referenceId: organizationId,
    status: "active",
  });
  await db.insert(ssoSchema.ssoProvider).values({
    id: crypto.randomUUID(),
    issuer: "https://idp.example.com",
    providerId: organizationId,
    organizationId,
    domain: verifiedDomain,
    domainVerified: true,
  });

  return auth.handler(
    new Request(`${env.BETTER_AUTH_URL}/api/auth/scim/v2/Users`, {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/scim+json" },
      body: JSON.stringify({
        schemas: ["urn:ietf:params:scim:schemas:core:2.0:User"],
        userName: provisionedEmail,
        emails: [{ value: provisionedEmail, primary: true }],
        active: true,
      }),
    }),
  );
}

async function cleanup(): Promise<void> {
  await db
    .delete(outboxSchema.outboxEvent)
    .where(eq(outboxSchema.outboxEvent.organizationId, organizationId));
  await db
    .delete(multiTenantSchema.organization)
    .where(eq(multiTenantSchema.organization.id, organizationId));
  await db
    .delete(billingSchema.subscription)
    .where(eq(billingSchema.subscription.referenceId, organizationId));
  await db.delete(authSchema.user).where(eq(authSchema.user.email, provisionedEmail));
}

async function issueConcurrently(service: ScimConnectionService): Promise<string[]> {
  const results = await Promise.all(
    Array.from({ length: CONCURRENT_ISSUES }, () =>
      service.issueToken({ organizationId, actorUserId }),
    ),
  );

  return results.flatMap((result) => (result.isSuccess ? [result.getValue().token] : []));
}

async function main(): Promise<void> {
  await cleanup();
  await db.insert(multiTenantSchema.organization).values({
    id: organizationId,
    name: "SCIM Connection Probe",
    slug: organizationId,
  });

  const service = new ScimConnectionService(
    di.IOutboxRepository,
    di.ITransactionService,
    di.IInstrumentation,
  );

  const firstIssues = await issueConcurrently(service);
  let connections = await connectionsOf();
  console.log(
    `[1] ${CONCURRENT_ISSUES} concurrent first issues ->`,
    `${firstIssues.length} tokens, ${connections.length} connections`,
  );
  check("every concurrent first issue returns a token", firstIssues.length === CONCURRENT_ISSUES);
  check(
    "the organization gets exactly one connection",
    connections.length === 1,
    connections.length,
  );
  check("exactly one credential is left active", (await activeCredentialsOf(connections)) === 1);

  const rotations = await issueConcurrently(service);
  connections = await connectionsOf();
  const active = await activeCredentialsOf(connections);
  console.log(
    `[2] ${CONCURRENT_ISSUES} concurrent rotations ->`,
    `${rotations.length} tokens, ${active} active credentials`,
  );
  check("every concurrent rotation returns a token", rotations.length === CONCURRENT_ISSUES);
  check("the organization still has one connection", connections.length === 1, connections.length);
  check("exactly one credential is left active after the rotations", active === 1, active);

  const issued = await service.issueToken({ organizationId, actorUserId });
  const provisioned = issued.isSuccess ? await provisionMember(issued.getValue().token) : undefined;
  const memberBefore = await isProvisionedMember();
  console.log("[3] SCIM provisioning ->", provisioned?.status, `member=${memberBefore}`);
  check("the directory provisions a member", provisioned?.status === 201 && memberBefore);

  const disconnected = await service.disconnect({ organizationId, actorUserId });
  const [status] = await db
    .select({ status: ssoSchema.scimManagedConnection.status })
    .from(ssoSchema.scimManagedConnection)
    .where(eq(ssoSchema.scimManagedConnection.provisioningDomainId, organizationId));
  console.log(
    "[4] disconnect after the issues ->",
    disconnected.isSuccess ? "success" : disconnected.getError(),
    `connection=${status?.status}`,
  );
  check("a disconnect inside the lock succeeds", disconnected.isSuccess);
  check("the plugin committed the decommission", status?.status !== "active", status?.status);
  check("the provisioned member was removed", memberBefore && !(await isProvisionedMember()));
  check(
    "org.member.removed was committed for the provisioned member",
    (await outboxEventsOf(EventTypes.ORG_MEMBER_REMOVED)) === 1,
  );
  check(
    "scim.connection.deleted was committed",
    (await outboxEventsOf(EventTypes.SCIM_CONNECTION_DELETED)) === 1,
  );

  const inOneRun = await di.ITransactionService.run(async () => {
    const reissued = await service.issueToken({ organizationId, actorUserId });
    if (reissued.isFailure) return reissued;

    return service.disconnect({ organizationId, actorUserId });
  });
  const statuses = (
    await db
      .select({ status: ssoSchema.scimManagedConnection.status })
      .from(ssoSchema.scimManagedConnection)
      .where(eq(ssoSchema.scimManagedConnection.provisioningDomainId, organizationId))
  ).map((row) => row.status);
  console.log(
    "[5] issue then disconnect in one app run ->",
    inOneRun.isSuccess ? "success" : inOneRun.getError(),
    statuses,
  );
  check("a token issued then disconnected inside one app run succeeds", inOneRun.isSuccess);
  check(
    "both connections end decommissioned",
    statuses.length === 2 && statuses.every((status) => status !== "active"),
    statuses,
  );
  check(
    "scim.connection.created and scim.connection.deleted were committed for both",
    (await outboxEventsOf(EventTypes.SCIM_CONNECTION_CREATED)) === 2 &&
      (await outboxEventsOf(EventTypes.SCIM_CONNECTION_DELETED)) === 2,
  );

  await cleanup();

  if (checks.failures > 0) {
    console.error(`\n${checks.failures} check(s) failed`);
    process.exit(1);
  }
  console.log("\nAll assertions passed, writes on a SCIM connection are serialised.");
  process.exit(0);
}

main().catch(async (err) => {
  console.error("check-scim-connection crashed:", err);
  await cleanup().catch(() => {});
  process.exit(1);
});
