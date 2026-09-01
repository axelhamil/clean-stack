import { describe, expect, test } from "vitest";
import {
  CURRENT_MEMBERSHIP_QUERY_PREFIX,
  currentMembershipQueryOptions,
} from "../current-membership";
import { subscriptionQueryOptions } from "../subscription";

const ORG_A = "a1c087a7-9e0d-4f94-a509-6545adfcebdb";
const ORG_B = "mSTU5PV24Yt4gxH9BJE8TgSSy4KvVO3v";

// Ces deux reponses sont calculees par le serveur a partir de
// `session.activeOrganizationId`, jamais d'un parametre d'URL : leur cle doit
// donc porter l'organisation, sinon une seule entree sert deux organisations.
describe("abonnement", () => {
  test("deux organisations ne partagent jamais une entree de cache", () => {
    expect(subscriptionQueryOptions(ORG_A).queryKey).not.toEqual(
      subscriptionQueryOptions(ORG_B).queryKey,
    );
  });

  test("la cle porte l'identifiant et reste stable a organisation egale", () => {
    expect(subscriptionQueryOptions(ORG_A).queryKey).toContain(ORG_A);
    expect(subscriptionQueryOptions(ORG_A).queryKey).toEqual(
      subscriptionQueryOptions(ORG_A).queryKey,
    );
  });

  test("sans organisation active la requete ne part pas", () => {
    // `GET /billing/subscription` porte `requireOrg` : sans organisation la
    // reponse ne peut etre qu'un 403.
    expect(subscriptionQueryOptions(null).enabled).toBe(false);
  });
});

describe("appartenance courante", () => {
  test("deux organisations ne partagent jamais une entree de cache", () => {
    expect(currentMembershipQueryOptions(ORG_A).queryKey).not.toEqual(
      currentMembershipQueryOptions(ORG_B).queryKey,
    );
  });

  test("l'absence d'organisation est `null`, jamais `undefined`", () => {
    // `undefined` dans une cle est efface a la serialisation : deux scopes
    // distincts retomberaient sur la meme entree — exactement le bug corrige.
    const key = currentMembershipQueryOptions(null).queryKey;
    expect(key).not.toContain(undefined);
    expect(key).toContain(null);
    expect(key).not.toEqual(currentMembershipQueryOptions(ORG_A).queryKey);
  });

  test("`null` reste un scope interroge, pas une requete desactivee", () => {
    // `getActiveMember` repond `null` hors organisation : une reponse valide,
    // donc une entree de cache legitime.
    expect(currentMembershipQueryOptions(null).enabled).toBeUndefined();
  });

  test("le prefixe exporte couvre toutes les organisations", () => {
    // C'est lui que `app-providers` reinvalide sur `broadcastAuthChange`, pour
    // ne pas rater une organisation en le recopiant a la main.
    for (const org of [ORG_A, ORG_B, null]) {
      expect(currentMembershipQueryOptions(org).queryKey.slice(0, 1)).toEqual([
        ...CURRENT_MEMBERSHIP_QUERY_PREFIX,
      ]);
    }
  });
});
