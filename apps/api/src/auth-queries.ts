/**
 * Data-access helpers for the BetterAuth bridge (auth.ts).
 *
 * Plain functions, no DI, no repository class, no port interface — auth is
 * infra config, not domain. See CLAUDE.md §DDD scope.
 */
import { and, count, db, desc, eq, schema, type Transaction } from "@packages/drizzle";

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

// ── #10 – sso providersLimit business-tier gate ────────────────────────────

export async function activeOrganizationIdFor(userId: string): Promise<string | null> {
  const [row] = await db
    .select({ organizationId: schema.session.activeOrganizationId })
    .from(schema.session)
    .where(eq(schema.session.userId, userId))
    .orderBy(desc(schema.session.createdAt))
    .limit(1);
  return row?.organizationId ?? null;
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
