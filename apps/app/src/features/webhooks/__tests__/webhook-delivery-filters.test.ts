import { describe, expect, it } from "vitest";
import { serializeDeliveryFilters } from "../webhook-delivery-filters";

describe("serializeDeliveryFilters", () => {
  it("drops undefined status", () => {
    expect(serializeDeliveryFilters({})).toEqual({});
  });
  it("keeps a set status", () => {
    expect(serializeDeliveryFilters({ status: "dead_letter" })).toEqual({ status: "dead_letter" });
  });
});
