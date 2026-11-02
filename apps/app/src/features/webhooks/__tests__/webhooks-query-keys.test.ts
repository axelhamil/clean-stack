import { describe, expect, test } from "vitest";
import {
  webhookDeliveriesInfiniteQueryOptions,
  webhookDeliveryDetailQueryOptions,
  webhookEndpointsQueryOptions,
} from "../api/webhooks.queries";

const ORG_A = "a1c087a7-9e0d-4f94-a509-6545adfcebdb";
const ORG_B = "mSTU5PV24Yt4gxH9BJE8TgSSy4KvVO3v";

// Every webhooks route carries `requireOrg`: the server scopes it on
// `session.activeOrganizationId`, never on a URL parameter. The key must carry
// the organization too, otherwise one entry serves two organizations and going
// back to the first one serves the second one's list.
const keyFactories = [
  ["endpoints", (org: string | null) => webhookEndpointsQueryOptions(org).queryKey],
  [
    "deliveries",
    (org: string | null) => webhookDeliveriesInfiniteQueryOptions(org, "ep-1", {}).queryKey,
  ],
  [
    "delivery detail",
    (org: string | null) => webhookDeliveryDetailQueryOptions(org, "ep-1", "dl-1").queryKey,
  ],
] as const;

describe("webhooks query keys", () => {
  test.each(keyFactories)("%s: two organizations never share a cache entry", (_label, keyFor) => {
    expect(keyFor(ORG_A)).not.toEqual(keyFor(ORG_B));
  });

  test.each(keyFactories)(
    "%s: the key carries the id and stays stable for the same organization",
    (_label, keyFor) => {
      expect(keyFor(ORG_A)).toContain(ORG_A);
      expect(keyFor(ORG_A)).toEqual(keyFor(ORG_A));
    },
  );

  test.each(keyFactories)("%s: no organization is `null`, never `undefined`", (_label, keyFor) => {
    // `undefined` is dropped when the key is serialized: two distinct scopes
    // would land on the same entry.
    expect(keyFor(null)).not.toContain(undefined);
    expect(keyFor(null)).toContain(null);
  });
});

describe("execution guard", () => {
  test("no webhooks request fires without an active organization", () => {
    expect(webhookEndpointsQueryOptions(null).enabled).toBe(false);
    expect(webhookDeliveriesInfiniteQueryOptions(null, "ep-1", {}).enabled).toBe(false);
    expect(webhookDeliveryDetailQueryOptions(null, "ep-1", "dl-1").enabled).toBe(false);
  });

  test("the guard lives in the factory, not at the call site", () => {
    // An `enabled` set at the call site would overwrite this one when spread:
    // the organization guard has to stay in the factory to be impossible to miss.
    expect(webhookDeliveriesInfiniteQueryOptions(ORG_A, "", {}).enabled).toBe(false);
    expect(webhookDeliveryDetailQueryOptions(ORG_A, "ep-1", "").enabled).toBe(false);
    expect(webhookDeliveriesInfiniteQueryOptions(ORG_A, "ep-1", {}).enabled).toBe(true);
  });
});

describe("invalidations must follow the organization segment", () => {
  test("the old prefix no longer matches the endpoints key", () => {
    // Safety net: an invalidation left on `["settings","webhooks","endpoints"]`
    // would match nothing anymore. The organization segment sits before it.
    const key = webhookEndpointsQueryOptions(ORG_A).queryKey;

    expect(key.slice(0, 3)).not.toEqual(["settings", "webhooks", "endpoints"]);
    expect(key.slice(0, 2)).toEqual(["settings", "webhooks"]);
  });

  test("the organization prefix isolates one organization's entries", () => {
    // `["settings","webhooks", orgId]` invalidates every webhooks entry of one
    // organization without touching the others.
    const prefix = webhookEndpointsQueryOptions(ORG_A).queryKey.slice(0, 3);

    expect(webhookDeliveriesInfiniteQueryOptions(ORG_A, "ep-1", {}).queryKey.slice(0, 3)).toEqual(
      prefix,
    );
    expect(
      webhookDeliveriesInfiniteQueryOptions(ORG_B, "ep-1", {}).queryKey.slice(0, 3),
    ).not.toEqual(prefix);
  });
});
