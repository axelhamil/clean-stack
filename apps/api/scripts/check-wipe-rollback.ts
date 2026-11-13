/**
 * Proves against a real Postgres that a failed deletion-confirmation enqueue rolls back
 * the whole account-wipe transaction, the guarantee added by moving `sendTemplate` inside
 * `this.transactions.run(...)` in `RgpdService.executeAccountWipe`.
 *
 * A mocked unit-of-work (see `rgpd.service.test.ts`) can only prove the callback *throws*
 * instead of returning; only a real `db.transaction(...)` can prove Postgres actually
 * discards the wipe's writes when that throw happens. This script is that proof.
 *
 * Note: `DrizzleEmailQueue.enqueue` uses `onConflictDoNothing` on the idempotency-key unique
 * index (see `fix(email): suppress duplicate enqueues instead of failing the batch`), so a
 * pre-existing row with the same idempotency key is silently skipped rather than raising a
 * SQL error, it can no longer be used to force the enqueue to fail. Instead this script adds
 * a temporary CHECK constraint on `email_message.to_address` that rejects the probe user's
 * email, forcing a genuine Postgres-level failure at the exact insert the wipe transaction
 * performs, then drops the constraint again in cleanup.
 *
 * A second probe then runs a wipe that succeeds and proves what the mocks cannot: the erased
 * account's api tokens are revoked in the same transaction (those of a deleted organization too,
 * before the cascade removes them), `ORG_MEMBER_REMOVED` reaches the
 * outbox for each organization that survives, and the token no longer authenticates.
 *
 * WARNING: `ALTER TABLE ... ADD CONSTRAINT` takes an ACCESS EXCLUSIVE lock on the shared
 * `email_message` table for the duration of the statement, stop the dev API worker (and any
 * other process reading/writing `email_message`) before running this script, or the lock wait
 * will queue behind it. This script also refuses to run against a non-local `DATABASE_URL` and
 * caps the lock wait with `lock_timeout` so a stuck lock fails fast instead of hanging.
 */

import { checkRecorder } from "@packages/test/check-harness";
import { requireLocalDatabase } from "@packages/test/require-local-database";

requireLocalDatabase("check-wipe-rollback");

import { DrizzleStaffStore } from "@modules/admin/adapters/drizzle-staff-store";
import * as staffSchema from "@modules/admin/schemas/staff";
import { DrizzleApiTokenRepository } from "@modules/api-token/adapters/drizzle-api-token-repository";
import { generateToken, hmacToken } from "@modules/api-token/rules/api-token-crypto";
import * as apiTokenSchema from "@modules/api-token/schemas/api-token";
import { DrizzleRgpdRepository } from "@modules/rgpd/adapters/drizzle-rgpd-repository";
import { RgpdService } from "@modules/rgpd/services/rgpd";
import { NoOpStorageService } from "@modules/uploads/adapters/noop-storage";
import type { IInstrumentation } from "@packages/ddd-kit";
import { NoOpInstrumentation } from "@packages/ddd-kit";
import {
  authSchema,
  db,
  eq,
  inArray,
  multiTenantSchema,
  outboxSchema,
  sql,
  TransactionService,
} from "@packages/drizzle";
import { DrizzleEmailQueue } from "@packages/email/drizzle-email-queue";
import { QueuedEmailService } from "@packages/email/email.service";
import { EventTypes } from "@packages/events";
import { DrizzleOutboxRepository } from "@packages/outbox/drizzle-outbox.repository";
import { Hono } from "hono";
import { authSecretKey } from "../src/auth/auth-secrets";
import { createAuthQueries } from "../src/auth/queries";
import { staffAccessRules } from "../src/composition/sources/rgpd";
import { di } from "../src/container";
import { env } from "../src/shared/env";
import { logger } from "../src/shared/logger";
import { requireApiToken } from "../src/shared/middleware/api-token.middleware";
import { DrizzleTotpVerifier } from "../src/shared/services/drizzle-totp-verifier";

const instrumentation: IInstrumentation = new NoOpInstrumentation();
const PROBE_MARKER = "wipe-rollback-probe";
const userId = `check-wipe-rollback-${crypto.randomUUID()}`;
const probeEmail = `${PROBE_MARKER}-${userId}@example.com`;
const CONSTRAINT_NAME = "check_wipe_rollback_probe";

const erasedId = `check-wipe-erased-${crypto.randomUUID()}`;
const erasedEmail = `${erasedId}@example.com`;
const teammateId = `${erasedId}-teammate`;
const teamOrgId = `${erasedId}-team`;
const personalOrgId = `${erasedId}-personal`;
const erasedMemberId = `${erasedId}-member`;
const personalTokenId = `${erasedId}-token-personal`;
const teamTokenId = `${erasedId}-token-team`;
const personalOrgTokenId = `${erasedId}-token-personal-org`;
const TOKEN_PREFIX = "clean_";
const TOKEN_PEPPER = "p".repeat(32);

const checks = checkRecorder();
const { check } = checks;

async function seedUser(): Promise<void> {
  await db.insert(authSchema.user).values({
    id: userId,
    name: "Wipe Rollback Probe",
    email: probeEmail,
    emailVerified: true,
    pendingDeletionUntil: new Date(Date.now() - 1000),
    deletedAt: null,
    locale: "en",
  });
  await db.insert(staffSchema.staffNote).values({
    id: `${userId}-note`,
    userId,
    body: "Probe note about the account.",
  });
}

async function addFailingConstraint(): Promise<void> {
  // Bound so a lock held by another process (e.g. a forgotten dev API worker) fails fast
  // instead of hanging the script indefinitely while holding up the wait queue.
  await db.execute(sql`SET lock_timeout = '5s'`);
  // DDL does not accept bind parameters, so the marker (a fixed, script-owned literal,
  // never user input) is inlined via sql.raw rather than a parameterized value.
  await db.execute(sql`
    ALTER TABLE email_message
    ADD CONSTRAINT ${sql.identifier(CONSTRAINT_NAME)}
    CHECK (to_address NOT LIKE ${sql.raw(`'%${PROBE_MARKER}%'`)})
  `);
}

async function dropFailingConstraint(): Promise<void> {
  await db.execute(sql`
    ALTER TABLE email_message DROP CONSTRAINT IF EXISTS ${sql.identifier(CONSTRAINT_NAME)}
  `);
}

async function cleanup(): Promise<void> {
  await dropFailingConstraint();
  await db.delete(authSchema.user).where(eq(authSchema.user.id, userId));
  await db.execute(sql`DELETE FROM email_message WHERE to_address = ${probeEmail}`);
  await db.execute(sql`DELETE FROM outbox_event WHERE aggregate_id = ${userId}`);
}

function buildRepository(): DrizzleRgpdRepository {
  return new DrizzleRgpdRepository(
    logger,
    instrumentation,
    di.IApiTokenRevoker,
    di.IStaffDataEraser,
    di.IEndedSessionsReader,
  );
}

function buildService(): RgpdService {
  const outbox = new DrizzleOutboxRepository(instrumentation, () => undefined);
  const email = new QueuedEmailService(
    new DrizzleEmailQueue(instrumentation, logger),
    instrumentation,
  );
  const uow = new TransactionService(instrumentation);
  return new RgpdService(
    buildRepository(),
    new NoOpStorageService(logger),
    email,
    uow,
    outbox,
    instrumentation,
    new DrizzleStaffStore(instrumentation, uow, logger),
    staffAccessRules(outbox, { PLATFORM_ADMIN_IDS: [] }),
    new DrizzleTotpVerifier(instrumentation, authSecretKey(env)),
    {
      appUrl: env.APP_URL,
      gracePeriodDays: env.RGPD_GRACE_PERIOD_DAYS,
      exportRateLimitHours: env.RGPD_EXPORT_RATE_LIMIT_HOURS,
      sweepDeadlineMs: env.SWEEP_DEADLINE_MS,
    },
    logger,
  );
}

async function seedErasedAccount(): Promise<string> {
  await db.insert(authSchema.user).values([
    {
      id: erasedId,
      name: "Wipe Erased Probe",
      email: erasedEmail,
      emailVerified: true,
      pendingDeletionUntil: new Date(Date.now() - 1000),
      locale: "en",
    },
    { id: teammateId, name: "Wipe Teammate Probe", email: `${teammateId}@example.com` },
  ]);
  await db.insert(multiTenantSchema.organization).values([
    { id: teamOrgId, name: "Wipe probe team", slug: teamOrgId },
    { id: personalOrgId, name: "Wipe probe personal", slug: `personal-${personalOrgId}` },
  ]);
  const member = (id: string, organizationId: string, memberUserId: string) => ({
    id,
    organizationId,
    userId: memberUserId,
    role: "owner",
    createdAt: new Date(),
  });
  await db
    .insert(multiTenantSchema.member)
    .values([
      member(erasedMemberId, teamOrgId, erasedId),
      member(`${teammateId}-member`, teamOrgId, teammateId),
      member(`${erasedId}-personal-member`, personalOrgId, erasedId),
    ]);

  const { raw, start } = generateToken(TOKEN_PREFIX);
  const token = (id: string, organizationId: string | null, tokenHmac: string) => ({
    id,
    userId: erasedId,
    organizationId,
    name: id,
    scopes: ["read:profile"],
    tokenHmac,
    tokenStart: start,
  });
  await db
    .insert(apiTokenSchema.apiToken)
    .values([
      token(personalTokenId, null, hmacToken(raw, TOKEN_PEPPER)),
      token(teamTokenId, teamOrgId, `${teamTokenId}-hmac`),
      token(personalOrgTokenId, personalOrgId, `${personalOrgTokenId}-hmac`),
    ]);
  return raw;
}

async function cleanupErasedAccount(): Promise<void> {
  await db.delete(authSchema.user).where(inArray(authSchema.user.id, [erasedId, teammateId]));
  await db
    .delete(multiTenantSchema.organization)
    .where(inArray(multiTenantSchema.organization.id, [teamOrgId, personalOrgId]));
  await db.execute(sql`DELETE FROM email_message WHERE to_address = ${erasedEmail}`);
  await db
    .delete(outboxSchema.outboxEvent)
    .where(
      inArray(outboxSchema.outboxEvent.aggregateId, [
        erasedId,
        personalOrgId,
        erasedMemberId,
        personalTokenId,
        teamTokenId,
        personalOrgTokenId,
      ]),
    );
}

async function requestWithToken(raw: string): Promise<number> {
  const app = new Hono()
    .use(
      requireApiToken(
        {
          repo: new DrizzleApiTokenRepository(instrumentation),
          outbox: new DrizzleOutboxRepository(instrumentation, () => undefined),
          uow: new TransactionService(instrumentation),
          instrumentation,
          logger,
          queries: createAuthQueries(instrumentation),
          prefix: TOKEN_PREFIX,
          pepper: TOKEN_PEPPER,
          pepperVersion: 1,
          bucketMin: 15,
        },
        { scopes: ["read:profile"] },
      ),
    )
    .get("/probe", (c) => c.text("ok"));
  const res = await app.request("/probe", { headers: { authorization: `Bearer ${raw}` } });
  return res.status;
}

async function checkErasedAccountLosesAccess(): Promise<void> {
  await cleanupErasedAccount();
  const raw = await seedErasedAccount();
  check("the token authenticates before the wipe", (await requestWithToken(raw)) === 200);

  const result = await buildService().executeAccountWipe({ userId: erasedId });
  check("the completed wipe reports success", result.isSuccess);

  const tokens = await db
    .select({ id: apiTokenSchema.apiToken.id, revokedAt: apiTokenSchema.apiToken.revokedAt })
    .from(apiTokenSchema.apiToken)
    .where(eq(apiTokenSchema.apiToken.userId, erasedId));
  check(
    "every api token left after the wipe is revoked",
    tokens.length === 2 && tokens.every((t) => t.revokedAt !== null),
    tokens,
  );

  const outboxRows = await db
    .select({
      eventType: outboxSchema.outboxEvent.eventType,
      aggregateId: outboxSchema.outboxEvent.aggregateId,
    })
    .from(outboxSchema.outboxEvent)
    .where(
      inArray(outboxSchema.outboxEvent.aggregateId, [
        erasedMemberId,
        personalTokenId,
        teamTokenId,
        personalOrgTokenId,
      ]),
    );
  const announced = outboxRows.map((r) => `${r.eventType}:${r.aggregateId}`).sort();
  const expected = [
    `${EventTypes.ORG_MEMBER_REMOVED}:${erasedMemberId}`,
    `${EventTypes.API_TOKEN_REVOKED}:${personalTokenId}`,
    `${EventTypes.API_TOKEN_REVOKED}:${teamTokenId}`,
    `${EventTypes.API_TOKEN_REVOKED}:${personalOrgTokenId}`,
    `${EventTypes.API_TOKEN_USED}:${personalTokenId}`,
  ].sort();
  check(
    "the outbox announces the surviving membership and every revoked token, deleted orgs included",
    JSON.stringify(announced) === JSON.stringify(expected),
    announced,
  );

  check("the token is refused after the wipe", (await requestWithToken(raw)) === 401);

  await cleanupErasedAccount();
}

async function main(): Promise<void> {
  await cleanup();
  await seedUser();
  await addFailingConstraint();

  const result = await buildService().executeAccountWipe({ userId });

  console.log("[1] executeAccountWipe result ->", result.isFailure ? result.getError() : "success");
  check("the wipe reports failure when the confirmation enqueue fails", result.isFailure);
  check(
    "the failure code is ACCOUNT_WIPE_NOTIFY_PROVIDER_FAILURE",
    result.isFailure && result.getError().code === "ACCOUNT_WIPE_NOTIFY_PROVIDER_FAILURE",
  );

  const [row] = await db
    .select({
      email: authSchema.user.email,
      deletedAt: authSchema.user.deletedAt,
      pendingDeletionUntil: authSchema.user.pendingDeletionUntil,
    })
    .from(authSchema.user)
    .where(eq(authSchema.user.id, userId))
    .limit(1);

  console.log("[2] user row after failed wipe ->", row);
  check("the user row still exists", row !== undefined);
  check("deleted_at is still NULL, the wipe did not persist", row?.deletedAt === null);
  check("the email was not anonymized, the wipe did not persist", row?.email === probeEmail);

  const notes = await db
    .select({ id: staffSchema.staffNote.id })
    .from(staffSchema.staffNote)
    .where(eq(staffSchema.staffNote.userId, userId));
  check("the staff notes come back with the rolled back wipe", notes.length === 1, notes);

  const readyForWipe = await buildRepository().findUsersReadyForWipe(50);
  const stillPending =
    readyForWipe.isSuccess && readyForWipe.getValue().some((r) => r.userId === userId);
  console.log("[3] still returned by findUsersReadyForWipe ->", stillPending);
  check("the account is still picked up by the next sweep (not lost)", stillPending);

  await cleanup();

  console.log("[4] a completed wipe cuts the erased account's api access");
  await checkErasedAccountLosesAccess();

  if (checks.failures > 0) {
    console.error(`\n${checks.failures} check(s) failed`);
    process.exit(1);
  }
  console.log(
    "\nAll assertions passed: the failed wipe rolled back, the completed one cut access.",
  );
  process.exit(0);
}

main().catch(async (err) => {
  console.error("check-wipe-rollback crashed:", err);
  await cleanup().catch(() => {});
  await cleanupErasedAccount().catch(() => {});
  process.exit(1);
});
