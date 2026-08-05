import { describe, expect, it } from "vitest";
import { serializeUserFilters } from "../admin-user-filters";

describe("serializeUserFilters", () => {
  it("omits empty filters", () => {
    expect(serializeUserFilters({ search: "", role: undefined, banned: undefined })).toEqual({});
  });

  it("serializes the banned flag as a string", () => {
    expect(serializeUserFilters({ search: "", role: undefined, banned: true })).toEqual({
      banned: "true",
    });
  });

  it("trims the search term", () => {
    expect(serializeUserFilters({ search: "  ada  ", role: undefined, banned: undefined })).toEqual(
      {
        search: "ada",
      },
    );
  });
});
