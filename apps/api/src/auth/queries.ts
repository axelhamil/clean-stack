/**
 * Data-access helpers for the BetterAuth bridge (auth/).
 *
 * Plain functions, no repository class, no port interface, auth is infra config,
 * not domain. See CLAUDE.md §DDD scope. `createAuthQueries` hands them out wrapped
 * in a span that captures and rethrows a failure, each single statement in its own
 * `db.query` span (root rule 8), built once by the composition root from the
 * injected instrumentation. `insertPersonalOrgWithOwner` (two statements) and
 * `lockSeatsOf` (a lock helper that exposes no SQL) keep the outer span
 * only.
 */

import { type IInstrumentation, Option } from "@packages/ddd-kit";
import {
  and,
  count,
  desc,
  eq,
  lockForTransaction,
  lt,
  resolveExecutor,
  schema,
  sql,
  ssoSchema,
} from "@packages/drizzle";
import type { EnforcedProvider } from "./sso-enforcement";

const DB_ATTRS = { "db.system.name": "postgresql" } as const;

type RunQuery = <R>(query: { toSQL(): { sql: string }; execute(): Promise<R> }) => Promise<R>;

interface QueryScope {
  exec: ReturnType<typeof resolveExecutor>;
  run: RunQuery;
}

// ── #1: ensurePersonalOrgFor queries ──────────────────────────────────────

async function findActiveMemberOrgId(
  { exec, run }: QueryScope,
  userId: string,
): Promise<string | undefined> {
  const [row] = await run(
    exec
      .select({ id: schema.member.organizationId })
      .from(schema.member)
      .where(eq(schema.member.userId, userId))
      .limit(1),
  );
  return row?.id;
}

async function insertPersonalOrgWithOwner(
  { exec }: QueryScope,
  params: {
    orgId: string;
    memberId: string;
    userId: string;
    slug: string;
    name: string;
    createdAt: Date;
  },
): Promise<void> {
  const { orgId, memberId, userId, slug, name, createdAt } = params;
  await exec.insert(schema.organization).values({ id: orgId, name, slug, createdAt });
  await exec.insert(schema.member).values({
    id: memberId,
    organizationId: orgId,
    userId,
    role: "owner",
    createdAt,
  });
}

// ── #2: sendChangeEmailConfirmation ──────────────────────────────────────

async function setPendingEmail(
  { exec, run }: QueryScope,
  userId: string,
  newEmail: string,
): Promise<void> {
  await run(
    exec.update(schema.user).set({ pendingEmail: newEmail }).where(eq(schema.user.id, userId)),
  );
}

// ── #3: afterRemoveMember: delete org when last member leaves ─────────────

async function deleteOrgIfEmpty(
  { exec, run }: QueryScope,
  organizationId: string,
): Promise<boolean> {
  const deleted = await run(
    exec
      .delete(schema.organization)
      .where(
        and(
          eq(schema.organization.id, organizationId),
          eq(exec.$count(schema.member, eq(schema.member.organizationId, organizationId)), 0),
        ),
      )
      .returning({ id: schema.organization.id }),
  );
  return deleted.length > 0;
}

// ── #4: databaseHooks.user.update.after ──────────────────────────────────

/** Clears `pendingEmail` when BetterAuth confirms the new address.
 *  Returns true if a row was actually updated (i.e. pendingEmail matched). */
async function clearConfirmedPendingEmail(
  { exec, run }: QueryScope,
  userId: string,
  email: string,
): Promise<boolean> {
  const cleared = await run(
    exec
      .update(schema.user)
      .set({ pendingEmail: null })
      .where(and(eq(schema.user.id, userId), eq(schema.user.pendingEmail, email)))
      .returning({ id: schema.user.id }),
  );
  return cleared.length > 0;
}

async function clearExpiredBan({ exec, run }: QueryScope, userId: string): Promise<boolean> {
  const cleared = await run(
    exec
      .update(schema.user)
      .set({ banned: false, banReason: null, banExpires: null, updatedAt: new Date() })
      .where(
        and(
          eq(schema.user.id, userId),
          eq(schema.user.banned, true),
          lt(schema.user.banExpires, new Date()),
        ),
      )
      .returning({ id: schema.user.id }),
  );

  return cleared.length > 0;
}

// ── #5: hooks.after /passkey/verify-registration ─────────────────────────

async function findLatestPasskey(
  { exec, run }: QueryScope,
  userId: string,
): Promise<{ id: string; deviceType: string | null } | undefined> {
  const [row] = await run(
    exec
      .select({ id: schema.passkey.id, deviceType: schema.passkey.deviceType })
      .from(schema.passkey)
      .where(eq(schema.passkey.userId, userId))
      .orderBy(desc(schema.passkey.createdAt))
      .limit(1),
  );
  return row;
}

// ── #6: hooks.after /link-social ─────────────────────────────────────────

async function findLatestLinkedAccount(
  { exec, run }: QueryScope,
  userId: string,
): Promise<
  | {
      id: string;
      providerId: string;
      accountId: string;
      createdAt: Date;
    }
  | undefined
> {
  const [row] = await run(
    exec
      .select({
        id: schema.account.id,
        providerId: schema.account.providerId,
        accountId: schema.account.accountId,
        createdAt: schema.account.createdAt,
      })
      .from(schema.account)
      .where(eq(schema.account.userId, userId))
      .orderBy(desc(schema.account.createdAt))
      .limit(1),
  );
  return row;
}

// ── #7: customSession ────────────────────────────────────────────────────

async function findActiveMemberRole(
  { exec, run }: QueryScope,
  userId: string,
  organizationId: string,
): Promise<string | null> {
  const [row] = await run(
    exec
      .select({ role: schema.member.role })
      .from(schema.member)
      .where(
        and(eq(schema.member.organizationId, organizationId), eq(schema.member.userId, userId)),
      )
      .limit(1),
  );
  return row?.role ?? null;
}

async function findOrgOwnerUserId(
  { exec, run }: QueryScope,
  organizationId: string,
): Promise<string | null> {
  const [row] = await run(
    exec
      .select({ userId: schema.member.userId })
      .from(schema.member)
      .where(and(eq(schema.member.organizationId, organizationId), eq(schema.member.role, "owner")))
      .limit(1),
  );
  return row?.userId ?? null;
}

async function countActiveMembers(
  { exec, run }: QueryScope,
  organizationId: string,
): Promise<number> {
  const [row] = await run(
    exec
      .select({ count: count() })
      .from(schema.member)
      .where(eq(schema.member.organizationId, organizationId)),
  );
  return row?.count ?? 0;
}

/**
 * Serialises seat checks for one organization until the ambient transaction
 * ends: a second transaction adding a member waits here, then counts the rows
 * the first one committed. Without it, two concurrent provisionings both count the same free
 * seat and both take it.
 */
async function lockSeatsOf(_scope: QueryScope, organizationId: string): Promise<void> {
  await lockForTransaction(`seats:${organizationId}`);
}

// ── #8: api-token middleware ──────────────────────────────────────────────

async function findUserById({ exec, run }: QueryScope, id: string) {
  const [row] = await run(exec.select().from(schema.user).where(eq(schema.user.id, id)).limit(1));
  return row;
}

// ── #9: public API v1 ────────────────────────────────────────────────────

async function findUserOrganizations(
  { exec, run }: QueryScope,
  userId: string,
): Promise<{ id: string; name: string; slug: string; role: string }[]> {
  return run(
    exec
      .select({
        id: schema.organization.id,
        name: schema.organization.name,
        slug: schema.organization.slug,
        role: schema.member.role,
      })
      .from(schema.member)
      .innerJoin(schema.organization, eq(schema.member.organizationId, schema.organization.id))
      .where(eq(schema.member.userId, userId)),
  );
}

// ── #10: hooks.after SSO bridge ────────────────────────────────────────────

async function findSsoProviderByProviderId(
  { exec, run }: QueryScope,
  providerId: string,
): Promise<{ organizationId: string | null; domain: string; issuer: string } | undefined> {
  const [row] = await run(
    exec
      .select({
        organizationId: ssoSchema.ssoProvider.organizationId,
        domain: ssoSchema.ssoProvider.domain,
        issuer: ssoSchema.ssoProvider.issuer,
      })
      .from(ssoSchema.ssoProvider)
      .where(eq(ssoSchema.ssoProvider.providerId, providerId))
      .limit(1),
  );
  return row;
}

// ── #11: SCIM bridge (hooks, identity resolution, connection service) ────

export interface ScimUserSnapshot {
  userId: string;
  connectionId: string;
  organizationId: string;
  externalId: string | null;
  active: boolean;
}

/**
 * A provisioned SCIM User as `@better-auth/scim` stores it. The SCIM resource id
 * the directory sees is this row's id, not the Better Auth user id, and the
 * provisioning domain is always the organization id (see `ScimConnectionService`).
 */
async function findScimUser(
  { exec, run }: QueryScope,
  scimUserId: string,
): Promise<ScimUserSnapshot | undefined> {
  const [row] = await run(
    exec
      .select({
        userId: ssoSchema.scimUser.userId,
        connectionId: ssoSchema.scimUser.connectionId,
        organizationId: ssoSchema.scimUser.provisioningDomainId,
        externalId: ssoSchema.scimUser.externalId,
        active: ssoSchema.scimUser.active,
      })
      .from(ssoSchema.scimUser)
      .where(eq(ssoSchema.scimUser.id, scimUserId))
      .limit(1),
  );
  return row;
}

/**
 * The user who created a managed SCIM connection: the actor of every SCIM event,
 * since a directory request authenticates with a bearer token and carries no
 * session of its own.
 */
async function scimConnectionCreator(
  { exec, run }: QueryScope,
  connectionId: string,
): Promise<string | null> {
  const [row] = await run(
    exec
      .select({ createdBy: ssoSchema.scimManagedConnection.createdBy })
      .from(ssoSchema.scimManagedConnection)
      .where(eq(ssoSchema.scimManagedConnection.connectionId, connectionId))
      .limit(1),
  );
  return row?.createdBy ?? null;
}

/**
 * The organization members a SCIM connection currently provisions, read before
 * the connection is decommissioned so the members it removes can be reported.
 */
async function scimProvisionedMembers(
  { exec, run }: QueryScope,
  connectionId: string,
  organizationId: string,
): Promise<{ memberId: string; userId: string }[]> {
  return run(
    exec
      .select({ memberId: schema.member.id, userId: schema.member.userId })
      .from(ssoSchema.scimUser)
      .innerJoin(
        schema.member,
        and(
          eq(schema.member.userId, ssoSchema.scimUser.userId),
          eq(schema.member.organizationId, ssoSchema.scimUser.provisioningDomainId),
        ),
      )
      .where(
        and(
          eq(ssoSchema.scimUser.connectionId, connectionId),
          eq(ssoSchema.scimUser.provisioningDomainId, organizationId),
        ),
      ),
  );
}

/**
 * Whether `domain` is an SSO domain this organization proved it controls. It is
 * the condition under which the organization's directory may take over an account
 * that already exists: the same proof `@better-auth/sso` asks for before it assigns
 * an SSO user to an organization.
 */
async function isVerifiedSsoDomainOf(
  { exec, run }: QueryScope,
  organizationId: string,
  domain: string,
): Promise<boolean> {
  const [row] = await run(
    exec
      .select({ id: ssoSchema.ssoProvider.id })
      .from(ssoSchema.ssoProvider)
      .where(
        and(
          eq(ssoSchema.ssoProvider.organizationId, organizationId),
          eq(sql`lower(${ssoSchema.ssoProvider.domain})`, domain),
          eq(ssoSchema.ssoProvider.domainVerified, true),
        ),
      )
      .limit(1),
  );
  return row !== undefined;
}

// ── #12: SSO enforcement: session-creation guard (Task 9) ─────────────────

async function emailFor({ exec, run }: QueryScope, userId: string): Promise<string | undefined> {
  const [row] = await run(
    exec
      .select({ email: schema.user.email })
      .from(schema.user)
      .where(eq(schema.user.id, userId))
      .limit(1),
  );
  return row?.email;
}

// ── #13: SSO enforcement predicate lookup ─────────────────────────────────

async function enforcedProviderForDomain(
  { exec, run }: QueryScope,
  domain: string,
): Promise<Option<EnforcedProvider>> {
  const [row] = await run(
    exec
      .select({
        providerId: ssoSchema.ssoProvider.providerId,
        organizationId: ssoSchema.ssoProvider.organizationId,
      })
      .from(ssoSchema.ssoProvider)
      .innerJoin(
        schema.organization,
        eq(schema.organization.id, ssoSchema.ssoProvider.organizationId),
      )
      .where(
        and(
          eq(sql`lower(${ssoSchema.ssoProvider.domain})`, domain),
          eq(ssoSchema.ssoProvider.domainVerified, true),
          eq(schema.organization.ssoEnforced, true),
        ),
      )
      .limit(1),
  );
  return row?.organizationId
    ? Option.some({ providerId: row.providerId, organizationId: row.organizationId })
    : Option.none();
}

// ── #14: SCIM provisioning: membership event bridge ───────────────────────

/**
 * The member row the SCIM membership projection writes through the plugin's
 * transaction adapter (no organization-plugin hook fires), so the SCIM after-hook
 * and `ScimConnectionService` have to read it back
 * to emit `org.member.joined` with the same shape `afterAddMember` produces:
 * the aggregate id is the member id, and `createdAt` is what tells a row this
 * request created apart from one that already existed.
 */
async function findMemberOf(
  { exec, run }: QueryScope,
  userId: string,
  organizationId: string,
): Promise<{ id: string; role: string; createdAt: Date } | undefined> {
  const [row] = await run(
    exec
      .select({
        id: schema.member.id,
        role: schema.member.role,
        createdAt: schema.member.createdAt,
      })
      .from(schema.member)
      .where(
        and(eq(schema.member.organizationId, organizationId), eq(schema.member.userId, userId)),
      )
      .limit(1),
  );
  return row;
}

// ── #15: SSO enforcement toggle (AdminActionService) ─────────────────────

async function setOrgSsoEnforced(
  { exec, run }: QueryScope,
  organizationId: string,
  enforced: boolean,
): Promise<void> {
  await run(
    exec
      .update(schema.organization)
      .set({ ssoEnforced: enforced })
      .where(eq(schema.organization.id, organizationId)),
  );
}

export function createAuthQueries(instrumentation: IInstrumentation) {
  const run: RunQuery = (query) =>
    instrumentation.startSpan(
      { name: query.toSQL().sql, op: "db.query", attributes: DB_ATTRS },
      () => query.execute(),
    );

  const traced =
    <A extends unknown[], R>(
      method: string,
      query: (scope: QueryScope, ...args: A) => Promise<R>,
    ) =>
    (...args: A): Promise<R> => {
      const exec = resolveExecutor();

      return instrumentation.startSpan({ name: `AuthQueries > ${method}` }, async () => {
        try {
          return await query({ exec, run }, ...args);
        } catch (err) {
          instrumentation.capture(err);
          throw err;
        }
      });
    };

  return {
    findActiveMemberOrgId: traced("findActiveMemberOrgId", findActiveMemberOrgId),
    insertPersonalOrgWithOwner: traced("insertPersonalOrgWithOwner", insertPersonalOrgWithOwner),
    setPendingEmail: traced("setPendingEmail", setPendingEmail),
    deleteOrgIfEmpty: traced("deleteOrgIfEmpty", deleteOrgIfEmpty),
    clearConfirmedPendingEmail: traced("clearConfirmedPendingEmail", clearConfirmedPendingEmail),
    clearExpiredBan: traced("clearExpiredBan", clearExpiredBan),
    findLatestPasskey: traced("findLatestPasskey", findLatestPasskey),
    findLatestLinkedAccount: traced("findLatestLinkedAccount", findLatestLinkedAccount),
    findActiveMemberRole: traced("findActiveMemberRole", findActiveMemberRole),
    findOrgOwnerUserId: traced("findOrgOwnerUserId", findOrgOwnerUserId),
    countActiveMembers: traced("countActiveMembers", countActiveMembers),
    lockSeatsOf: traced("lockSeatsOf", lockSeatsOf),
    findUserById: traced("findUserById", findUserById),
    findUserOrganizations: traced("findUserOrganizations", findUserOrganizations),
    findSsoProviderByProviderId: traced("findSsoProviderByProviderId", findSsoProviderByProviderId),
    findScimUser: traced("findScimUser", findScimUser),
    scimConnectionCreator: traced("scimConnectionCreator", scimConnectionCreator),
    scimProvisionedMembers: traced("scimProvisionedMembers", scimProvisionedMembers),
    isVerifiedSsoDomainOf: traced("isVerifiedSsoDomainOf", isVerifiedSsoDomainOf),
    emailFor: traced("emailFor", emailFor),
    enforcedProviderForDomain: traced("enforcedProviderForDomain", enforcedProviderForDomain),
    findMemberOf: traced("findMemberOf", findMemberOf),
    setOrgSsoEnforced: traced("setOrgSsoEnforced", setOrgSsoEnforced),
  };
}

export type AuthQueries = ReturnType<typeof createAuthQueries>;
