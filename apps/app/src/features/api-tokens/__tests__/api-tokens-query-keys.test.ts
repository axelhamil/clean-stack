import { describe, expect, test } from "vitest";
import { apiTokensQueryOptions } from "../api/api-tokens.queries";

const ORG_A = "a1c087a7-9e0d-4f94-a509-6545adfcebdb";
const ORG_B = "mSTU5PV24Yt4gxH9BJE8TgSSy4KvVO3v";

// `GET /settings/tokens` filtre sur `session.activeOrganizationId` (ou `IS NULL`
// quand il n'y en a pas) : la reponse depend de l'organisation active meme si
// la route ne porte pas `requireOrg`. La cle doit donc la porter aussi.
describe("cles de query jetons d'API", () => {
  test("deux organisations ne partagent jamais une entree de cache", () => {
    expect(apiTokensQueryOptions(ORG_A).queryKey).not.toEqual(
      apiTokensQueryOptions(ORG_B).queryKey,
    );
  });

  test("la cle porte l'identifiant et reste stable a organisation egale", () => {
    expect(apiTokensQueryOptions(ORG_A).queryKey).toContain(ORG_A);
    expect(apiTokensQueryOptions(ORG_A).queryKey).toEqual(apiTokensQueryOptions(ORG_A).queryKey);
  });

  test("`null` est un scope reel, distinct de toute organisation", () => {
    // Sans organisation active l'endpoint renvoie les jetons personnels
    // (`organization_id IS NULL`) : une reponse valide, donc une entree de
    // cache legitime — et surtout `null`, jamais `undefined`, qu'une cle ne
    // peut pas porter sans faire collapser deux scopes sur une entree.
    const key = apiTokensQueryOptions(null).queryKey;
    expect(key).not.toContain(undefined);
    expect(key).toContain(null);
    expect(key).not.toEqual(apiTokensQueryOptions(ORG_A).queryKey);
    expect(apiTokensQueryOptions(null).enabled).toBeUndefined();
  });

  test("l'ancien prefixe ne matche plus la cle", () => {
    // Garde-fou : une invalidation restee sur `["settings","api-tokens"]` en
    // cle exacte ne toucherait plus rien.
    expect(apiTokensQueryOptions(ORG_A).queryKey).not.toEqual(["settings", "api-tokens"]);
    expect(apiTokensQueryOptions(ORG_A).queryKey.slice(0, 2)).toEqual(["settings", "api-tokens"]);
  });
});
