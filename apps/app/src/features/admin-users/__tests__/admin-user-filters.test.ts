import { describe, expect, it } from "vitest";
import { serializeUserFilters } from "../admin-user-filters";

describe("serializeUserFilters", () => {
  it("omits empty filters", () => {
    expect(serializeUserFilters({ search: "", banned: undefined })).toEqual({});
  });

  it("serializes the banned flag as a string", () => {
    expect(serializeUserFilters({ search: "", banned: true })).toEqual({
      banned: "true",
    });
  });

  it("trims the search term", () => {
    expect(serializeUserFilters({ search: "  ada  ", banned: undefined })).toEqual({
      search: "ada",
    });
  });
});
