/**
 * Data-access helpers for the BetterAuth bridge (auth.ts).
 *
 * Plain functions, no DI, no repository class, no port interface — auth is
 * infra config, not domain. See CLAUDE.md §DDD scope.
 */

import { base64Url } from "@better-auth/utils/base64";
import { createHash } from "@better-auth/utils/hash";
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
import { constantTimeEqual } from "better-auth/crypto";
import type { EnforcementLookup } from "./shared/auth/sso-enforcement";
import { scimTokenPartsFromHeader } from "./shared/auth/sso-paths";

// ── #1 – ensurePersonalOrgFor queries ──────────────────────────────────────

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

// ── #2 – sendChangeEmailConfirmation ──────────────────────────────────────

export async function setPendingEmail(userId: string, newEmail: string): Promise<void> {
  await db.update(schema.user).set({ pendingEmail: newEmail }).where(eq(schema.user.id, userId));
}

// ── #3 – afterRemoveMember: delete org when last member leaves ─────────────

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

// ── #4 – databaseHooks.user.update.after ──────────────────────────────────

/** Clears `pendingEmail` when BetterAuth confirms the new address.
 *  Returns true if a row was actually updated (i.e. pendingEmail matched). */
export async function clearConfirmedPendingEmail(userId: string, email: string): Promise<boolean> {
  const cleared = await db
    .update(schema.user)
    .set({ pendingEmail: null })
    .where(and(eq(schema.user.id, userId), eq(schema.user.pendingEmail, email)))
    .returning({ id: schema.user.id });
  return cleared.length > 0;
}

// ── #5 – hooks.after /passkey/verify-registration ─────────────────────────

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

// ── #6 – hooks.after /link-social ─────────────────────────────────────────

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

// ── #7 – customSession ────────────────────────────────────────────────────

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

export async function countActiveMembers(organizationId: string): Promise<number> {
  const [row] = await db
    .select({ count: count() })
    .from(schema.member)
    .where(eq(schema.member.organizationId, organizationId));
  return row?.count ?? 0;
}

// ── #8 – api-token middleware ──────────────────────────────────────────────

export async function findUserById(id: string) {
  const [row] = await db.select().from(schema.user).where(eq(schema.user.id, id)).limit(1);
  return row;
}

// ── #9 – public API v1 ────────────────────────────────────────────────────

export async function updateUserName(userId: string, name: string): Promise<void> {
  await db.update(schema.user).set({ name }).where(eq(schema.user.id, userId));
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

// ── #10 – hooks.after SSO bridge ────────────────────────────────────────────

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

// ── #11 – hooks.after SCIM bridge ───────────────────────────────────────────

export async function scimConnectionOwner(
  providerId: string,
): Promise<{ userId: string | null; organizationId: string | null }> {
  const [row] = await db
    .select({
      userId: ssoSchema.scimProvider.userId,
      organizationId: ssoSchema.scimProvider.organizationId,
    })
    .from(ssoSchema.scimProvider)
    .where(eq(ssoSchema.scimProvider.providerId, providerId))
    .limit(1);
  return { userId: row?.userId ?? null, organizationId: row?.organizationId ?? null };
}

/**
 * Mirrors `storeSCIMToken: "hashed"` — the fixed mode `scim()` is mounted with in
 * `auth.ts`. @better-auth/scim doesn't export its own hasher, so this reimplements
 * the one deterministic algorithm that mount config actually uses: a SHA-256 digest,
 * base64url-encoded without padding. If that mount option ever changes to
 * "encrypted" or a custom hasher, this must change with it.
 */
async function hashScimToken(token: string): Promise<string> {
  const digest = await createHash("SHA-256").digest(new TextEncoder().encode(token));
  return base64Url.encode(new Uint8Array(digest), { padding: false });
}

/**
 * Post-review hardening: `scimConnectionOwner(scimProviderIdFromToken(...))` resolves
 * an actor/org from the bearer header's *claimed* provider id without ever checking
 * the token against the stored hash. `hooks.before` runs ahead of the SCIM plugin's
 * own bearer verification (`runBeforeHooks` executes before `endpoint(...)`, which is
 * where the plugin's `authMiddleware` lives), so a forged `Authorization` header with
 * a real (guessable — `providerId` is a deterministic slug of the org's domain)
 * provider id let an unauthenticated caller: (a) plant a fabricated actor in the
 * SCIM-deprovisioning audit snapshot before the request 401s, later attributed to an
 * unrelated admin's ordinary member removal within the snapshot TTL; (b) probe seat
 * capacity pre-auth cross-tenant (402 leaking `maxMembers` vs 401), since the seat
 * gate ran on the same unverified resolution.
 *
 * Any `hooks.before` branch that needs the connection owner MUST use this instead of
 * `scimConnectionOwner` + `scimProviderIdFromToken` — it hashes the decoded token and
 * constant-time-compares it against the stored connection before returning anything.
 * Returns `null` on a missing/malformed header, an unknown provider, or a token that
 * doesn't match — the caller then must fall through to the endpoint's own 401 rather
 * than act on unverified input, and the seat cap simply isn't checked here for that
 * request (it 401s before ever writing a member row, so there is nothing to gate).
 */
export async function verifiedScimConnectionOwner(
  headers: Headers | undefined,
): Promise<{ userId: string | null; organizationId: string | null } | null> {
  const parts = scimTokenPartsFromHeader(headers);
  if (!parts) return null;
  const [row] = await db
    .select({
      userId: ssoSchema.scimProvider.userId,
      organizationId: ssoSchema.scimProvider.organizationId,
      scimToken: ssoSchema.scimProvider.scimToken,
    })
    .from(ssoSchema.scimProvider)
    .where(eq(ssoSchema.scimProvider.providerId, parts.providerId))
    .limit(1);
  if (!row) return null;
  const hashed = await hashScimToken(parts.token);
  if (!constantTimeEqual(hashed, row.scimToken)) return null;
  return { userId: row.userId, organizationId: row.organizationId };
}

// ── #12 – SSO enforcement: session-creation guard (Task 9) ─────────────────

export async function emailFor(userId: string): Promise<string | undefined> {
  const [row] = await db
    .select({ email: schema.user.email })
    .from(schema.user)
    .where(eq(schema.user.id, userId))
    .limit(1);
  return row?.email;
}

// ── #13 – SSO enforcement predicate lookup ─────────────────────────────────

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
    ? { providerId: row.providerId, organizationId: row.organizationId }
    : null;
};

// ── #13 – SCIM provisioning: membership event bridge ───────────────────────

/**
 * The member row `@better-auth/scim` writes with a raw `adapter.create` (no
 * organization-plugin hook fires), so the SCIM after-hook has to read it back
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
