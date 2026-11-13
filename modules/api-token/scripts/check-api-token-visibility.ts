// `visibleTokensFilter` (infra/repos/drizzle/api-token.repository.ts) builds
// the confinement WHERE clause with `and`/`or`/`eq`/`isNull`, a mocked `tx`
// never evaluates a `WHERE`, and the list query re-applies `ownerReaches` in
// TypeScript, which would hide a leaky predicate. This runs the predicate alone,
// the real list query and the real repository against a real Postgres and
// checks exactly which rows each owner scope returns. See `apps/api/CLAUDE.md` ("write
// an executable check against a real database and wire it to a script") and
// `check-fanout-preferences.ts` for the reference shape.
//
// Run: `pnpm --filter @modules/api-token check:api-token-visibility` (needs `pnpm --filter api db:seed`).
// Re-run after any change to `visibleTokensFilter` or `TokenOwner`.
//
// WARNING: writes real user, organization and api_token rows (all prefixed
// and cleaned up). Local database only, `requireLocalDatabase` enforces it.

import { NoOpInstrumentation } from "@packages/ddd-kit";
import { authSchema, db, multiTenantSchema, sql } from "@packages/drizzle";
import { checkRecorder, findSeededUserId } from "@packages/test/check-harness";
import { requireLocalDatabase } from "@packages/test/require-local-database";
import * as apiTokenSchema from "../schemas/api-token";
import { ApiTokenId } from "../src/domain/api-token/api-token-id";
import type { TokenOwner } from "../src/domain/api-token/services/token-visibility.service";
import { DrizzleListApiTokensQuery } from "../src/infra/queries/list-api-tokens.query";
import {
  DrizzleApiTokenRepository,
  visibleTokensFilter,
} from "../src/infra/repos/drizzle/api-token.repository";

requireLocalDatabase("check-api-token-visibility");

const checks = checkRecorder();
const { check } = checks;
const ownerId = await findSeededUserId();

const PROBE = "api-token-visibility-probe";
const otherUserId = `${PROBE}-other-user`;
const orgReachableId = `${PROBE}-org-reachable`;
const orgUnreachableId = `${PROBE}-org-unreachable`;

const ownPersonal = `${PROBE}-own-personal`; // owner, org-less
const ownReachableOrg = `${PROBE}-own-reachable-org`; // owner, in orgReachable
const ownUnreachableOrg = `${PROBE}-own-unreachable-org`; // owner, in orgUnreachable
const otherPersonal = `${PROBE}-other-personal`; // other user, org-less
const otherReachableOrg = `${PROBE}-other-reachable-org`; // other user, in orgReachable, same org as the owner

// Clears every api_token the seeded account owns, not just the probe's own,
// a stray token left over from another script or a manual session would
// otherwise leak into the "exactly these ids" assertions below.
const reset = async () => {
  await db.execute(
    sql`DELETE FROM api_token WHERE user_id = ${ownerId} OR user_id = ${otherUserId}`,
  );
  await db.execute(
    sql`DELETE FROM organization WHERE id IN (${orgReachableId}, ${orgUnreachableId})`,
  );
  await db.execute(sql`DELETE FROM "user" WHERE id = ${otherUserId}`);
};

await reset();

await db.insert(authSchema.user).values({
  id: otherUserId,
  name: "probe other user",
  email: `${PROBE}-other@example.test`,
});
await db.insert(multiTenantSchema.organization).values([
  { id: orgReachableId, name: "probe reachable org", slug: `${PROBE}-reachable` },
  { id: orgUnreachableId, name: "probe unreachable org", slug: `${PROBE}-unreachable` },
]);

const token = (id: string, userId: string, organizationId: string | null) => ({
  id,
  userId,
  organizationId,
  name: id,
  scopes: ["read:profile"],
  tokenHmac: `${id}-hmac`,
  pepperVersion: 1,
  tokenStart: id.slice(0, 8),
});

await db
  .insert(apiTokenSchema.apiToken)
  .values([
    token(ownPersonal, ownerId, null),
    token(ownReachableOrg, ownerId, orgReachableId),
    token(ownUnreachableOrg, ownerId, orgUnreachableId),
    token(otherPersonal, otherUserId, null),
    token(otherReachableOrg, otherUserId, orgReachableId),
  ]);

const repo = new DrizzleApiTokenRepository(new NoOpInstrumentation());
const listQuery = new DrizzleListApiTokensQuery(new NoOpInstrumentation());

async function predicateIdsFor(owner: TokenOwner): Promise<string[]> {
  const rows = await db
    .select({ id: apiTokenSchema.apiToken.id })
    .from(apiTokenSchema.apiToken)
    .where(visibleTokensFilter(owner));
  return rows.map((r) => r.id).sort();
}

async function listedIdsFor(owner: TokenOwner): Promise<string[]> {
  const listed = await listQuery.execute({ owner });
  if (listed.isFailure) throw new Error(listed.getError().message);

  return listed
    .getValue()
    .map((t) => t.id.value)
    .sort();
}

async function idsFor(owner: TokenOwner): Promise<string[]> {
  const [predicate, listed] = await Promise.all([predicateIdsFor(owner), listedIdsFor(owner)]);
  check(
    "the list query returns exactly what the predicate alone selects",
    predicate.join(",") === listed.join(","),
    {
      predicate,
      listed,
    },
  );

  return listed;
}

console.log("[1] a personal scope sees only the owner's org-less token");
const personalIds = await idsFor({ kind: "personal", userId: ownerId });
check("exactly the owner's personal token, nothing else", personalIds.join(",") === ownPersonal, {
  personalIds,
});

console.log(
  "[2] orgAndPersonal sees the owner's personal token plus their token in that org, and nothing owned by someone else or by the owner in a different org",
);
const scopedIds = await idsFor({
  kind: "orgAndPersonal",
  userId: ownerId,
  organizationId: orgReachableId,
});
check(
  "exactly the owner's personal + reachable-org tokens",
  scopedIds.join(",") === [ownPersonal, ownReachableOrg].sort().join(","),
  { scopedIds },
);
check(
  "the owner's token in a different org never leaks in",
  !scopedIds.includes(ownUnreachableOrg),
);
check(
  "another user's token in the very same org never leaks in",
  !scopedIds.includes(otherReachableOrg),
);
check("another user's personal token never leaks in", !scopedIds.includes(otherPersonal));

console.log("[3] findByIdForOwner: a row outside the visible set is absent, never a leaked 403");
const outOfScope = await repo.findByIdForOwner(new ApiTokenId(ownUnreachableOrg), {
  kind: "orgAndPersonal",
  userId: ownerId,
  organizationId: orgReachableId,
});
check(
  "Option.none() for the owner's own token in an org they didn't scope to",
  outOfScope.isSuccess && outOfScope.getValue().isNone(),
);

const otherOwnersToken = await repo.findByIdForOwner(new ApiTokenId(otherReachableOrg), {
  kind: "orgAndPersonal",
  userId: ownerId,
  organizationId: orgReachableId,
});
check(
  "Option.none() for another member's token in the same org",
  otherOwnersToken.isSuccess && otherOwnersToken.getValue().isNone(),
);

const inScope = await repo.findByIdForOwner(new ApiTokenId(ownReachableOrg), {
  kind: "orgAndPersonal",
  userId: ownerId,
  organizationId: orgReachableId,
});
check(
  "the owner's own token in that org is reachable",
  inScope.isSuccess && inScope.getValue().isSome(),
);

await reset();

if (checks.failures > 0) {
  console.error("check:api-token-visibility FAILED");
  process.exit(1);
}
console.log("check:api-token-visibility OK");
process.exit(0);
