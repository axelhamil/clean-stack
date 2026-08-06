import { describe, expect, it } from "bun:test";
import { authSchema, db, multiTenantSchema } from "@packages/drizzle";
import { NoOpInstrumentation } from "../../../shared/services/noop-instrumentation";
import type { ApiTokenRecord } from "../application/ports/api-token.port";
import { DrizzleApiTokenRepository } from "../infrastructure/repositories/drizzle-api-token.repository";

const repo = new DrizzleApiTokenRepository(new NoOpInstrumentation());

async function seedUser(): Promise<string> {
  const id = crypto.randomUUID();
  await db.insert(authSchema.user).values({
    id,
    name: "Test User",
    email: `test-${id}@example.com`,
    emailVerified: false,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  return id;
}

async function seedOrg(): Promise<string> {
  const id = crypto.randomUUID();
  await db.insert(multiTenantSchema.organization).values({
    id,
    name: "Test Org",
    slug: `org-${id}`,
    createdAt: new Date(),
  });
  return id;
}

function makeRecord(over: Partial<ApiTokenRecord> & { userId: string }): ApiTokenRecord {
  return {
    id: crypto.randomUUID(),
    organizationId: null,
    name: "ci",
    scopes: ["read:profile"],
    tokenHmac: crypto.randomUUID(),
    pepperVersion: 1,
    tokenStart: "clean_abcd1234",
    lastUsedAt: null,
    expiresAt: null,
    revokedAt: null,
    revokedReason: null,
    createdAt: new Date(),
    ...over,
  };
}

describe("DrizzleApiTokenRepository", () => {
  it("returns none for an unknown hmac", async () => {
    const found = await repo.findByHmac(crypto.randomUUID());
    expect(found.isSuccess).toBe(true);
    expect(found.getValue().isNone()).toBe(true);
  });

  it("hides a token from a different owner behind Option.none", async () => {
    const userId = await seedUser();
    const row = makeRecord({ userId });
    await repo.insert(row);

    const mine = await repo.findByIdForOwner(row.id, { userId, organizationId: null });
    expect(mine.getValue().isSome()).toBe(true);

    const theirs = await repo.findByIdForOwner(row.id, {
      userId: await seedUser(),
      organizationId: null,
    });
    expect(theirs.getValue().isNone()).toBe(true);
  });

  it("only touches last_used_at once per bucket", async () => {
    const userId = await seedUser();
    const row = makeRecord({ userId });
    await repo.insert(row);

    const floor = new Date(Date.now() - 15 * 60_000);
    await repo.touchLastUsed(row.id, floor);
    const first = (await repo.findByHmac(row.tokenHmac)).getValue().unwrap().lastUsedAt;

    await repo.touchLastUsed(row.id, floor);
    const second = (await repo.findByHmac(row.tokenHmac)).getValue().unwrap().lastUsedAt;

    expect(second?.getTime()).toBe(first?.getTime());
  });

  it("revokes only the tokens of the lost membership", async () => {
    const userId = await seedUser();
    const orgA = await seedOrg();
    const orgB = await seedOrg();
    const inA = makeRecord({ userId, organizationId: orgA });
    const inB = makeRecord({ userId, organizationId: orgB });
    await repo.insert(inA);
    await repo.insert(inB);

    const revoked = await repo.revokeAllForMembership(userId, orgA);
    expect(revoked.getValue()).toEqual([inA.id]);

    const stillLive = (await repo.findByHmac(inB.tokenHmac)).getValue().unwrap();
    expect(stillLive.revokedAt).toBeNull();
  });
});
