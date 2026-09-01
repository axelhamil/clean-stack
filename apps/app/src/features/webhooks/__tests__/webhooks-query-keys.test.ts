import { describe, expect, test } from "vitest";
import {
  webhookDeliveriesInfiniteQueryOptions,
  webhookDeliveryDetailQueryOptions,
  webhookEndpointsQueryOptions,
} from "../api/webhooks.queries";

const ORG_A = "a1c087a7-9e0d-4f94-a509-6545adfcebdb";
const ORG_B = "mSTU5PV24Yt4gxH9BJE8TgSSy4KvVO3v";

// Toutes les routes webhooks portent `requireOrg` : le serveur les scope sur
// `session.activeOrganizationId`, jamais sur un parametre d'URL. La cle doit
// donc porter l'organisation, sinon une seule entree sert deux organisations —
// et le retour sur la premiere ressert la liste de la seconde.
const keyFactories = [
  ["endpoints", (org: string | null) => webhookEndpointsQueryOptions(org).queryKey],
  [
    "livraisons",
    (org: string | null) => webhookDeliveriesInfiniteQueryOptions(org, "ep-1", {}).queryKey,
  ],
  [
    "detail de livraison",
    (org: string | null) => webhookDeliveryDetailQueryOptions(org, "ep-1", "dl-1").queryKey,
  ],
] as const;

describe("cles de query webhooks", () => {
  test.each(keyFactories)(
    "%s : deux organisations ne partagent jamais une entree de cache",
    (_label, keyFor) => {
      expect(keyFor(ORG_A)).not.toEqual(keyFor(ORG_B));
    },
  );

  test.each(keyFactories)(
    "%s : la cle porte l'identifiant et reste stable a organisation egale",
    (_label, keyFor) => {
      expect(keyFor(ORG_A)).toContain(ORG_A);
      expect(keyFor(ORG_A)).toEqual(keyFor(ORG_A));
    },
  );

  test.each(keyFactories)(
    "%s : l'absence d'organisation est `null`, jamais `undefined`",
    (_label, keyFor) => {
      // `undefined` dans une cle est efface a la serialisation : deux scopes
      // distincts retomberaient sur la meme entree.
      expect(keyFor(null)).not.toContain(undefined);
      expect(keyFor(null)).toContain(null);
    },
  );
});

describe("garde d'execution", () => {
  test("sans organisation active aucune requete webhooks ne part", () => {
    expect(webhookEndpointsQueryOptions(null).enabled).toBe(false);
    expect(webhookDeliveriesInfiniteQueryOptions(null, "ep-1", {}).enabled).toBe(false);
    expect(webhookDeliveryDetailQueryOptions(null, "ep-1", "dl-1").enabled).toBe(false);
  });

  test("la garde vit dans la fabrique, pas au point d'appel", () => {
    // Un `enabled` pose au point d'appel ecraserait celui-ci en le spreadant :
    // la garde organisation doit rester dans la fabrique pour etre inratable.
    expect(webhookDeliveriesInfiniteQueryOptions(ORG_A, "", {}).enabled).toBe(false);
    expect(webhookDeliveryDetailQueryOptions(ORG_A, "ep-1", "").enabled).toBe(false);
    expect(webhookDeliveriesInfiniteQueryOptions(ORG_A, "ep-1", {}).enabled).toBe(true);
  });
});

describe("les invalidations doivent suivre le nouveau segment", () => {
  test("l'ancien prefixe ne matche plus la cle des endpoints", () => {
    // Garde-fou : une invalidation restee sur `["settings","webhooks","endpoints"]`
    // ne toucherait plus rien. Le segment organisation s'intercale avant.
    const key = webhookEndpointsQueryOptions(ORG_A).queryKey;
    expect(key.slice(0, 3)).not.toEqual(["settings", "webhooks", "endpoints"]);
    expect(key.slice(0, 2)).toEqual(["settings", "webhooks"]);
  });

  test("le prefixe organisation isole les entrees d'une seule organisation", () => {
    // `["settings","webhooks", orgId]` invalide tout le webhook d'une orga sans
    // toucher aux autres.
    const prefix = webhookEndpointsQueryOptions(ORG_A).queryKey.slice(0, 3);
    expect(webhookDeliveriesInfiniteQueryOptions(ORG_A, "ep-1", {}).queryKey.slice(0, 3)).toEqual(
      prefix,
    );
    expect(
      webhookDeliveriesInfiniteQueryOptions(ORG_B, "ep-1", {}).queryKey.slice(0, 3),
    ).not.toEqual(prefix);
  });
});
