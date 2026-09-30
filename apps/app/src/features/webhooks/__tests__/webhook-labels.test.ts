import { describe, expect, it } from "vitest";
import { enLabel } from "../../../shared/i18n/__tests__/catalog-t";
import {
  DELIVERY_STATUS_BADGE_VARIANTS,
  DELIVERY_STATUS_KEYS,
  ENDPOINT_STATUS_KEYS,
  isDeliveryStatus,
} from "../webhook-labels";

describe("ENDPOINT_STATUS_KEYS", () => {
  // `satisfies Record<EndpointStatus, string>` only proves every status has AN
  // entry, not that each one points at the RIGHT one. A swapped pair
  // (e.g. `active` reading `common:states.endpoint.paused`) still type-checks,
  // so this asserts the mapping itself, not just its exhaustiveness.
  it("maps each endpoint status to its own catalog key, never a swapped one", () => {
    expect(ENDPOINT_STATUS_KEYS).toStrictEqual({
      active: "common:states.endpoint.active",
      paused: "common:states.endpoint.paused",
      "auto-disabled": "common:states.endpoint.autoDisabled",
    });
  });

  it("every key resolves to the matching English label", () => {
    expect(enLabel(ENDPOINT_STATUS_KEYS.active, "common")).toBe("Active");
    expect(enLabel(ENDPOINT_STATUS_KEYS.paused, "common")).toBe("Paused");
    expect(enLabel(ENDPOINT_STATUS_KEYS["auto-disabled"], "common")).toBe("Auto-disabled");
  });
});

describe("DELIVERY_STATUS_KEYS", () => {
  it("maps each delivery status to its own catalog key, never a swapped one", () => {
    expect(DELIVERY_STATUS_KEYS).toStrictEqual({
      pending: "common:states.delivery.pending",
      success: "common:states.delivery.success",
      failed: "common:states.delivery.failed",
      dead_letter: "common:states.delivery.deadLetter",
    });
  });

  it("every key resolves to the matching English label", () => {
    expect(enLabel(DELIVERY_STATUS_KEYS.pending, "common")).toBe("Pending");
    expect(enLabel(DELIVERY_STATUS_KEYS.success, "common")).toBe("Success");
    expect(enLabel(DELIVERY_STATUS_KEYS.failed, "common")).toBe("Failed");
    expect(enLabel(DELIVERY_STATUS_KEYS.dead_letter, "common")).toBe("Dead letter");
  });
});

describe("isDeliveryStatus", () => {
  it("accepts the four known statuses", () => {
    expect(isDeliveryStatus("pending")).toBe(true);
    expect(isDeliveryStatus("success")).toBe(true);
    expect(isDeliveryStatus("failed")).toBe(true);
    expect(isDeliveryStatus("dead_letter")).toBe(true);
  });

  it("rejects anything else", () => {
    expect(isDeliveryStatus("dead-letter")).toBe(false);
    expect(isDeliveryStatus("")).toBe(false);
  });
});

describe("DELIVERY_STATUS_BADGE_VARIANTS", () => {
  it("flags failed and dead-letter deliveries as destructive, success as default", () => {
    expect(DELIVERY_STATUS_BADGE_VARIANTS).toStrictEqual({
      pending: "secondary",
      success: "default",
      failed: "destructive",
      dead_letter: "destructive",
    });
  });
});
