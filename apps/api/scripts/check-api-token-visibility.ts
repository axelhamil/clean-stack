// `visibleTokensFilter` (drizzle-api-token.repository.ts) builds the
// confinement WHERE clause with `and`/`or`/`eq`/`isNull` — a mocked `tx`
// never evaluates a `WHERE`. The unit suite
// (`drizzle-api-token.repository.test.ts`) replaces those Drizzle builders
// with opaque stand-ins, so a green run there proves only that the method was
// called, never that the predicate excludes/includes the right rows. This
// runs the real repository against a real Postgres and checks exactly which
// rows each owner scope returns. See `apps/api/src/shared/CLAUDE.md` ("write
// an executable check against a real database and wire it to a script") and
// `check-fanout-preferences.ts` for the reference shape.
//
// Run: `pnpm --filter api check:api-token-visibility` (needs `pnpm --filter api db:seed`).
// Re-run after any change to `visibleTokensFilter` or `TokenOwner`.
//
// WARNING: writes real user, organization and api_token rows (all prefixed
// and cleaned up). Local database only — `requireLocalDatabase` enforces it.

import { apiTokenSchema, authSchema, db, eq, multiTenantSchema, sql } from "@packages/drizzle";
import type { TokenOwner } from "../src/modules/api-token/application/ports/api-token.port";
import { DrizzleApiTokenRepository } from "../src/modules/api-token/infrastructure/repositories/drizzle-api-token.repository";
import { NoOpInstrumentation } from "../src/shared/services/noop-instrumentation";
import { requireLocalDatabase } from "./require-local-database";
import { seedEmail } from "./seed-account";

requireLocalDatabase("check-api-token-visibility");

let failed = false;
function check(label: string, ok: boolean, extra?: unknown) {
  const suffix = extra === undefined ? "" : ` :: ${JSON.stringify(extra)}`;
  console.log(`${ok ? "  OK" : "  FAIL"}: ${label}${suffix}`);
  if (!ok) failed = true;
}

const email = seedEmail();
const [owner] = await db
  .select({ id: authSchema.user.id })
  .from(authSchema.user)
  .where(eq(authSchema.user.email, email))
  .limit(1);
if (!owner) {
  throw new Error(
    `no user for ${email} — run \`pnpm --filter api db:seed\` first, ` +
      "or point this check at another account with SEED_EMAIL.",
  );
}
const ownerId = owner.id;

const PROBE = "api-token-visibility-probe";
const otherUserId = `${PROBE}-other-user`;
const orgReachableId = `${PROBE}-org-reachable`;
const orgUnreachableId = `${PROBE}-org-unreachable`;

const ownPersonal = `${PROBE}-own-personal`; // owner, org-less
const ownReachableOrg = `${PROBE}-own-reachable-org`; // owner, in orgReachable
const ownUnreachableOrg = `${PROBE}-own-unreachable-org`; // owner, in orgUnreachable
const otherPersonal = `${PROBE}-other-personal`; // other user, org-less
const otherReachableOrg = `${PROBE}-other-reachable-org`; // other user, in orgReachable — same org as the owner

// Clears every api_token the seeded account owns, not just the probe's own —
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
  scopes: ["read"],
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

async function idsFor(owner: TokenOwner): Promise<string[]> {
  const result = await repo.listByOwner(owner);
  if (result.isFailure) throw new Error(result.getError().message);
  return result
    .getValue()
    .map((r) => r.id)
    .sort();
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
const outOfScope = await repo.findByIdForOwner(ownUnreachableOrg, {
  kind: "orgAndPersonal",
  userId: ownerId,
  organizationId: orgReachableId,
});
check(
  "Option.none() for the owner's own token in an org they didn't scope to",
  outOfScope.isSuccess && outOfScope.getValue().isNone(),
);

const otherOwnersToken = await repo.findByIdForOwner(otherReachableOrg, {
  kind: "orgAndPersonal",
  userId: ownerId,
  organizationId: orgReachableId,
});
check(
  "Option.none() for another member's token in the same org",
  otherOwnersToken.isSuccess && otherOwnersToken.getValue().isNone(),
);

const inScope = await repo.findByIdForOwner(ownReachableOrg, {
  kind: "orgAndPersonal",
  userId: ownerId,
  organizationId: orgReachableId,
});
check(
  "the owner's own token in that org is reachable",
  inScope.isSuccess && inScope.getValue().isSome(),
);

await reset();

if (failed) {
  console.error("check:api-token-visibility FAILED");
  process.exit(1);
}
console.log("check:api-token-visibility OK");
process.exit(0);
