import { enCatalog } from "@packages/i18n";
import { describe, expect, it } from "vitest";
import { isSubscriptionStatus, STATUS_KEYS, TIER_KEYS } from "../billing-labels";

function resolve(key: string): string | undefined {
  let cur: unknown = enCatalog.settings;
  for (const seg of key.split(".")) {
    if (typeof cur !== "object" || cur === null) return undefined;
    cur = (cur as Record<string, unknown>)[seg];
  }
  return typeof cur === "string" ? cur : undefined;
}

describe("TIER_KEYS", () => {
  // `satisfies Record<Tier, string>` only proves every tier has AN entry —
  // it does not prove each one points at the RIGHT one. A swapped pair
  // (e.g. `free` reading `billing.tier.pro`) still type-checks, so this
  // asserts the mapping itself, not just its exhaustiveness.
  it("maps each tier to its own catalog key, never a swapped one", () => {
    expect(TIER_KEYS).toStrictEqual({
      free: "billing.tier.free",
      pro: "billing.tier.pro",
      business: "billing.tier.business",
    });
  });

  it("every key resolves to the matching English label", () => {
    expect(resolve(TIER_KEYS.free)).toBe("Free");
    expect(resolve(TIER_KEYS.pro)).toBe("Pro");
    expect(resolve(TIER_KEYS.business)).toBe("Business");
  });
});

describe("STATUS_KEYS", () => {
  it("maps each subscription status to its own catalog key, never a swapped one", () => {
    expect(STATUS_KEYS).toStrictEqual({
      free: "billing.status.free",
      active: "billing.status.active",
      trialing: "billing.status.trialing",
      past_due: "billing.status.pastDue",
      canceled: "billing.status.canceled",
      unpaid: "billing.status.unpaid",
      incomplete: "billing.status.incomplete",
      incomplete_expired: "billing.status.incompleteExpired",
      paused: "billing.status.paused",
    });
  });

  it("every key resolves to the matching English label", () => {
    expect(resolve(STATUS_KEYS.free)).toBe("Free");
    expect(resolve(STATUS_KEYS.active)).toBe("Active");
    expect(resolve(STATUS_KEYS.trialing)).toBe("Trial");
    expect(resolve(STATUS_KEYS.past_due)).toBe("Past due");
    expect(resolve(STATUS_KEYS.canceled)).toBe("Canceled");
    expect(resolve(STATUS_KEYS.unpaid)).toBe("Unpaid");
    expect(resolve(STATUS_KEYS.incomplete)).toBe("Incomplete");
    expect(resolve(STATUS_KEYS.incomplete_expired)).toBe("Incomplete — expired");
    expect(resolve(STATUS_KEYS.paused)).toBe("Paused");
  });
});

describe("isSubscriptionStatus", () => {
  it("accepts every known status", () => {
    for (const status of Object.keys(STATUS_KEYS)) {
      expect(isSubscriptionStatus(status)).toBe(true);
    }
  });

  it("rejects an unrecognized status", () => {
    expect(isSubscriptionStatus("some_future_stripe_status")).toBe(false);
    expect(isSubscriptionStatus("")).toBe(false);
  });
});
