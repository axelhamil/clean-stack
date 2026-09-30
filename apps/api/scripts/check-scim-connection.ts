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

import { db, eq, inArray, multiTenantSchema, outboxSchema, ssoSchema } from "@packages/drizzle";
import { di } from "../src/container";
import { ScimConnectionService } from "../src/shared/services/scim-connection.service";

const CONCURRENT_ISSUES = 4;
const organizationId = `check-scim-connection-${crypto.randomUUID()}`;
const actorUserId = `check-scim-connection-actor-${crypto.randomUUID()}`;

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

async function cleanup(): Promise<void> {
  await db
    .delete(outboxSchema.outboxEvent)
    .where(eq(outboxSchema.outboxEvent.organizationId, organizationId));
  await db
    .delete(multiTenantSchema.organization)
    .where(eq(multiTenantSchema.organization.id, organizationId));
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
