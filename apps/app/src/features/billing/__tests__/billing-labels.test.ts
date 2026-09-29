import { describe, expect, it } from "vitest";
import { enLabel } from "../../../shared/i18n/__tests__/catalog-t";
import { isSubscriptionStatus, STATUS_KEYS, TIER_KEYS } from "../billing-labels";

describe("TIER_KEYS", () => {
  // `satisfies Record<Tier, string>` only proves every tier has AN entry;
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
    expect(enLabel(TIER_KEYS.free, "settings")).toBe("Free");
    expect(enLabel(TIER_KEYS.pro, "settings")).toBe("Pro");
    expect(enLabel(TIER_KEYS.business, "settings")).toBe("Business");
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
    expect(enLabel(STATUS_KEYS.free, "settings")).toBe("Free");
    expect(enLabel(STATUS_KEYS.active, "settings")).toBe("Active");
    expect(enLabel(STATUS_KEYS.trialing, "settings")).toBe("Trial");
    expect(enLabel(STATUS_KEYS.past_due, "settings")).toBe("Past due");
    expect(enLabel(STATUS_KEYS.canceled, "settings")).toBe("Canceled");
    expect(enLabel(STATUS_KEYS.unpaid, "settings")).toBe("Unpaid");
    expect(enLabel(STATUS_KEYS.incomplete, "settings")).toBe("Incomplete");
    expect(enLabel(STATUS_KEYS.incomplete_expired, "settings")).toBe("Incomplete (expired)");
    expect(enLabel(STATUS_KEYS.paused, "settings")).toBe("Paused");
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
