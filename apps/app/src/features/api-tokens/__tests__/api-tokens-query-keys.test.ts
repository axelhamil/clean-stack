import { describe, expect, test } from "vitest";
import { apiTokensQueryOptions } from "../api/api-tokens.queries";

const ORG_A = "a1c087a7-9e0d-4f94-a509-6545adfcebdb";
const ORG_B = "mSTU5PV24Yt4gxH9BJE8TgSSy4KvVO3v";

// `GET /settings/tokens` filters on `session.activeOrganizationId` (or `IS NULL`
// when there is none): the response depends on the active organization even
// though the route carries no `requireOrg`, so the key has to carry it too.
describe("api token query keys", () => {
  test("two organizations never share a cache entry", () => {
    expect(apiTokensQueryOptions(ORG_A).queryKey).not.toEqual(
      apiTokensQueryOptions(ORG_B).queryKey,
    );
  });

  test("the key carries the id and stays stable for the same organization", () => {
    expect(apiTokensQueryOptions(ORG_A).queryKey).toContain(ORG_A);
    expect(apiTokensQueryOptions(ORG_A).queryKey).toEqual(apiTokensQueryOptions(ORG_A).queryKey);
  });

  test("`null` is a real scope, distinct from any organization", () => {
    // Without an active organization the endpoint returns the personal tokens
    // (`organization_id IS NULL`): a valid response, so a legitimate cache entry.
    // It must be `null`, never `undefined`, which a key cannot carry without
    // collapsing two scopes onto one entry.
    const key = apiTokensQueryOptions(null).queryKey;

    expect(key).not.toContain(undefined);
    expect(key).toContain(null);
    expect(key).not.toEqual(apiTokensQueryOptions(ORG_A).queryKey);
    expect(apiTokensQueryOptions(null).enabled).toBeUndefined();
  });

  test("the old prefix no longer matches the key", () => {
    // Safety net: an invalidation left on `["settings","api-tokens"]` as an exact
    // key would match nothing anymore.
    expect(apiTokensQueryOptions(ORG_A).queryKey).not.toEqual(["settings", "api-tokens"]);
    expect(apiTokensQueryOptions(ORG_A).queryKey.slice(0, 2)).toEqual(["settings", "api-tokens"]);
  });
});
