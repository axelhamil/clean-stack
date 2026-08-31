import { enCatalog } from "@packages/i18n";
import { describe, expect, it } from "vitest";
import {
  DELIVERY_STATUS_KEYS,
  ENDPOINT_STATUS_KEYS,
  isDeliveryStatus,
  isEndpointStatus,
} from "../webhook-labels";

function resolve(prefixedKey: string): string | undefined {
  const [namespace, path] = prefixedKey.split(":");
  if (namespace !== "common" || path === undefined) return undefined;
  let cur: unknown = enCatalog.common;
  for (const seg of path.split(".")) {
    if (typeof cur !== "object" || cur === null) return undefined;
    cur = (cur as Record<string, unknown>)[seg];
  }
  return typeof cur === "string" ? cur : undefined;
}

describe("ENDPOINT_STATUS_KEYS", () => {
  // `satisfies Record<EndpointStatus, string>` only proves every status has AN
  // entry — it does not prove each one points at the RIGHT one. A swapped pair
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
    expect(resolve(ENDPOINT_STATUS_KEYS.active)).toBe("Active");
    expect(resolve(ENDPOINT_STATUS_KEYS.paused)).toBe("Paused");
    expect(resolve(ENDPOINT_STATUS_KEYS["auto-disabled"])).toBe("Auto-disabled");
  });
});

describe("isEndpointStatus", () => {
  it("accepts the three known statuses", () => {
    expect(isEndpointStatus("active")).toBe(true);
    expect(isEndpointStatus("paused")).toBe(true);
    expect(isEndpointStatus("auto-disabled")).toBe(true);
  });

  it("rejects anything else", () => {
    expect(isEndpointStatus("disabled")).toBe(false);
    expect(isEndpointStatus("")).toBe(false);
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
    expect(resolve(DELIVERY_STATUS_KEYS.pending)).toBe("Pending");
    expect(resolve(DELIVERY_STATUS_KEYS.success)).toBe("Success");
    expect(resolve(DELIVERY_STATUS_KEYS.failed)).toBe("Failed");
    expect(resolve(DELIVERY_STATUS_KEYS.dead_letter)).toBe("Dead letter");
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
