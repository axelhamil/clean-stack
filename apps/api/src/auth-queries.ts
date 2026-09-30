/**
 * Data-access helpers for the BetterAuth bridge (auth.ts).
 *
 * Plain functions, no DI, no repository class, no port interface, auth is
 * infra config, not domain. See CLAUDE.md §DDD scope.
 */

import { Option } from "@packages/ddd-kit";
import {
  and,
  count,
  db,
  desc,
  eq,
  schema,
  sql,
  ssoSchema,
  type Transaction,
} from "@packages/drizzle";
import type { EnforcementLookup } from "./shared/auth/sso-enforcement";

// ── #1: ensurePersonalOrgFor queries ──────────────────────────────────────

export async function findActiveMemberOrgId(
  userId: string,
  tx?: Transaction,
): Promise<string | undefined> {
  const exec = tx ?? db;
  const [row] = await exec
    .select({ id: schema.member.organizationId })
    .from(schema.member)
    .where(eq(schema.member.userId, userId))
    .limit(1);
  return row?.id;
}

export async function insertPersonalOrgWithOwner(
  params: {
    orgId: string;
    memberId: string;
    userId: string;
    slug: string;
    name: string;
    createdAt: Date;
  },
  tx: Transaction,
): Promise<void> {
  const { orgId, memberId, userId, slug, name, createdAt } = params;
  await tx.insert(schema.organization).values({ id: orgId, name, slug, createdAt });
  await tx.insert(schema.member).values({
    id: memberId,
    organizationId: orgId,
    userId,
    role: "owner",
    createdAt,
  });
}

// ── #2: sendChangeEmailConfirmation ──────────────────────────────────────

export async function setPendingEmail(
  userId: string,
  newEmail: string,
  tx?: Transaction,
): Promise<void> {
  const exec = tx ?? db;
  await exec.update(schema.user).set({ pendingEmail: newEmail }).where(eq(schema.user.id, userId));
}

// ── #3: afterRemoveMember: delete org when last member leaves ─────────────

export async function deleteOrgIfEmpty(organizationId: string, tx?: Transaction): Promise<boolean> {
  const exec = tx ?? db;
  const deleted = await exec
    .delete(schema.organization)
    .where(
      and(
        eq(schema.organization.id, organizationId),
        eq(exec.$count(schema.member, eq(schema.member.organizationId, organizationId)), 0),
      ),
    )
    .returning({ id: schema.organization.id });
  return deleted.length > 0;
}

// ── #4: databaseHooks.user.update.after ──────────────────────────────────

/** Clears `pendingEmail` when BetterAuth confirms the new address.
 *  Returns true if a row was actually updated (i.e. pendingEmail matched). */
export async function clearConfirmedPendingEmail(
  userId: string,
  email: string,
  tx?: Transaction,
): Promise<boolean> {
  const exec = tx ?? db;
  const cleared = await exec
    .update(schema.user)
    .set({ pendingEmail: null })
    .where(and(eq(schema.user.id, userId), eq(schema.user.pendingEmail, email)))
    .returning({ id: schema.user.id });
  return cleared.length > 0;
}

// ── #5: hooks.after /passkey/verify-registration ─────────────────────────

export async function findLatestPasskey(
  userId: string,
): Promise<{ id: string; deviceType: string | null } | undefined> {
  const [row] = await db
    .select({ id: schema.passkey.id, deviceType: schema.passkey.deviceType })
    .from(schema.passkey)
    .where(eq(schema.passkey.userId, userId))
    .orderBy(desc(schema.passkey.createdAt))
    .limit(1);
  return row;
}

// ── #6: hooks.after /link-social ─────────────────────────────────────────

export async function findLatestLinkedAccount(userId: string): Promise<
  | {
      id: string;
      providerId: string;
      accountId: string;
      createdAt: Date;
    }
  | undefined
> {
  const [row] = await db
    .select({
      id: schema.account.id,
      providerId: schema.account.providerId,
      accountId: schema.account.accountId,
      createdAt: schema.account.createdAt,
    })
    .from(schema.account)
    .where(eq(schema.account.userId, userId))
    .orderBy(desc(schema.account.createdAt))
    .limit(1);
  return row;
}

// ── #7: customSession ────────────────────────────────────────────────────

export async function findActiveMemberRole(
  userId: string,
  organizationId: string,
): Promise<string | null> {
  const [row] = await db
    .select({ role: schema.member.role })
    .from(schema.member)
    .where(and(eq(schema.member.organizationId, organizationId), eq(schema.member.userId, userId)))
    .limit(1);
  return row?.role ?? null;
}

export async function findOrgOwnerUserId(organizationId: string): Promise<string | null> {
  const [row] = await db
    .select({ userId: schema.member.userId })
    .from(schema.member)
    .where(and(eq(schema.member.organizationId, organizationId), eq(schema.member.role, "owner")))
    .limit(1);
  return row?.userId ?? null;
}

export async function countActiveMembers(
  organizationId: string,
  tx?: Transaction,
): Promise<number> {
  const [row] = await (tx ?? db)
    .select({ count: count() })
    .from(schema.member)
    .where(eq(schema.member.organizationId, organizationId));
  return row?.count ?? 0;
}

/**
 * Serialises seat checks for one organization until `tx` ends: a second
 * transaction adding a member waits here, then counts the rows the first one
 * committed. Without it, two concurrent provisionings both count the same free
 * seat and both take it.
 */
export async function lockSeatsOf(organizationId: string, tx: Transaction): Promise<void> {
  await tx.execute(
    sql`select pg_advisory_xact_lock(hashtextextended(${`seats:${organizationId}`}, 0))`,
  );
}

// ── #8: api-token middleware ──────────────────────────────────────────────

export async function findUserById(id: string) {
  const [row] = await db.select().from(schema.user).where(eq(schema.user.id, id)).limit(1);
  return row;
}

// ── #9: public API v1 ────────────────────────────────────────────────────

export async function updateUserName(
  userId: string,
  name: string,
  tx?: Transaction,
): Promise<void> {
  const exec = tx ?? db;
  await exec.update(schema.user).set({ name }).where(eq(schema.user.id, userId));
}

export async function findUserOrganizations(
  userId: string,
): Promise<{ id: string; name: string; slug: string; role: string }[]> {
  return db
    .select({
      id: schema.organization.id,
      name: schema.organization.name,
      slug: schema.organization.slug,
      role: schema.member.role,
    })
    .from(schema.member)
    .innerJoin(schema.organization, eq(schema.member.organizationId, schema.organization.id))
    .where(eq(schema.member.userId, userId));
}

// ── #10: hooks.after SSO bridge ────────────────────────────────────────────

export async function findSsoProviderByProviderId(
  providerId: string,
): Promise<{ organizationId: string | null; domain: string; issuer: string } | undefined> {
  const [row] = await db
    .select({
      organizationId: ssoSchema.ssoProvider.organizationId,
      domain: ssoSchema.ssoProvider.domain,
      issuer: ssoSchema.ssoProvider.issuer,
    })
    .from(ssoSchema.ssoProvider)
    .where(eq(ssoSchema.ssoProvider.providerId, providerId))
    .limit(1);
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
export async function findScimUser(scimUserId: string): Promise<ScimUserSnapshot | undefined> {
  const [row] = await db
    .select({
      userId: ssoSchema.scimUser.userId,
      connectionId: ssoSchema.scimUser.connectionId,
      organizationId: ssoSchema.scimUser.provisioningDomainId,
      externalId: ssoSchema.scimUser.externalId,
      active: ssoSchema.scimUser.active,
    })
    .from(ssoSchema.scimUser)
    .where(eq(ssoSchema.scimUser.id, scimUserId))
    .limit(1);
  return row;
}

/**
 * The user who created a managed SCIM connection: the actor of every SCIM event,
 * since a directory request authenticates with a bearer token and carries no
 * session of its own.
 */
export async function scimConnectionCreator(connectionId: string): Promise<string | null> {
  const [row] = await db
    .select({ createdBy: ssoSchema.scimManagedConnection.createdBy })
    .from(ssoSchema.scimManagedConnection)
    .where(eq(ssoSchema.scimManagedConnection.connectionId, connectionId))
    .limit(1);
  return row?.createdBy ?? null;
}

/**
 * The organization members a SCIM connection currently provisions, read before
 * the connection is decommissioned so the members it removes can be reported.
 */
export async function scimProvisionedMembers(
  connectionId: string,
  organizationId: string,
): Promise<{ memberId: string; userId: string }[]> {
  return db
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
    );
}

/**
 * Whether `domain` is an SSO domain this organization proved it controls. It is
 * the condition under which the organization's directory may take over an account
 * that already exists: the same proof `@better-auth/sso` asks for before it assigns
 * an SSO user to an organization.
 */
export async function isVerifiedSsoDomainOf(
  organizationId: string,
  domain: string,
): Promise<boolean> {
  const [row] = await db
    .select({ id: ssoSchema.ssoProvider.id })
    .from(ssoSchema.ssoProvider)
    .where(
      and(
        eq(ssoSchema.ssoProvider.organizationId, organizationId),
        eq(sql`lower(${ssoSchema.ssoProvider.domain})`, domain),
        eq(ssoSchema.ssoProvider.domainVerified, true),
      ),
    )
    .limit(1);
  return row !== undefined;
}

// ── #12: SSO enforcement: session-creation guard (Task 9) ─────────────────

export async function emailFor(userId: string): Promise<string | undefined> {
  const [row] = await db
    .select({ email: schema.user.email })
    .from(schema.user)
    .where(eq(schema.user.id, userId))
    .limit(1);
  return row?.email;
}

// ── #13: SSO enforcement predicate lookup ─────────────────────────────────

export const enforcedProviderForDomain: EnforcementLookup = async (domain) => {
  const [row] = await db
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
    .limit(1);
  return row?.organizationId
    ? Option.some({ providerId: row.providerId, organizationId: row.organizationId })
    : Option.none();
};

// ── #14: SCIM provisioning: membership event bridge ───────────────────────

/**
 * The member row the SCIM membership projection writes through the plugin's
 * transaction adapter (no organization-plugin hook fires), so the SCIM after-hook
 * and `ScimConnectionService` have to read it back
 * to emit `org.member.joined` with the same shape `afterAddMember` produces:
 * the aggregate id is the member id, and `createdAt` is what tells a row this
 * request created apart from one that already existed.
 */
export async function findMemberOf(
  userId: string,
  organizationId: string,
): Promise<{ id: string; role: string; createdAt: Date } | undefined> {
  const [row] = await db
    .select({
      id: schema.member.id,
      role: schema.member.role,
      createdAt: schema.member.createdAt,
    })
    .from(schema.member)
    .where(and(eq(schema.member.organizationId, organizationId), eq(schema.member.userId, userId)))
    .limit(1);
  return row;
}

// ── #15: SSO enforcement toggle (AdminActionService) ─────────────────────

export async function setOrgSsoEnforced(
  organizationId: string,
  enforced: boolean,
  tx?: Transaction,
): Promise<void> {
  const exec = tx ?? db;
  await exec
    .update(schema.organization)
    .set({ ssoEnforced: enforced })
    .where(eq(schema.organization.id, organizationId));
}
