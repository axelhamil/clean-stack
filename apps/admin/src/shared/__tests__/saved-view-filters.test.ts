import { describe, expect, it } from "vitest";
import { hasFilters, sameFilters, screenFilters } from "../saved-view-filters";

describe("saved view filters", () => {
  it("reads two filter sets as equal whatever their order and their unset keys", () => {
    expect(sameFilters({ q: "a", org: "b", status: undefined }, { org: "b", q: "a" })).toBe(true);
  });

  it("tells a different value apart", () => {
    expect(sameFilters({ q: "a" }, { q: "b" })).toBe(false);
  });

  it("keeps only the filters of the screen, whatever else sits in the URL", () => {
    expect(screenFilters("users", { search: "dev", q: "dev" })).toEqual({ q: "dev" });
    expect(screenFilters("orgs", { status: "active", q: "dev" })).toEqual({ q: "dev" });
    expect(screenFilters("audit", { q: "dev", actor: "user-1" })).toEqual({ actor: "user-1" });
  });

  it("does not count an unset filter", () => {
    expect(hasFilters({ q: undefined })).toBe(false);
  });
});
