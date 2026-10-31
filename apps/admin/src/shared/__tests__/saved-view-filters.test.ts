import { describe, expect, it } from "vitest";
import { hasFilters, sameFilters } from "../saved-view-filters";

describe("saved view filters", () => {
  it("reads two filter sets as equal whatever their order and their unset keys", () => {
    expect(sameFilters({ q: "a", org: "b", status: undefined }, { org: "b", q: "a" })).toBe(true);
  });

  it("tells a different value apart", () => {
    expect(sameFilters({ q: "a" }, { q: "b" })).toBe(false);
  });

  it("does not count an unset filter", () => {
    expect(hasFilters({ q: undefined })).toBe(false);
  });
});
