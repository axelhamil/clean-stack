import { describe, expect, it } from "vitest";
import { nullWithoutActiveOrganization } from "../no-active-organization";

describe("nullWithoutActiveOrganization", () => {
  it("answers null when there is no active organization", () => {
    expect(
      nullWithoutActiveOrganization({ data: null, error: { code: "NO_ACTIVE_ORGANIZATION" } }),
    ).toBeNull();
  });

  it("rethrows any other error", () => {
    const error = { code: "UNAUTHORIZED" };
    expect(() => nullWithoutActiveOrganization({ data: null, error })).toThrow(
      expect.objectContaining(error),
    );
  });

  it("returns the data, or null when the call resolves empty", () => {
    expect(nullWithoutActiveOrganization({ data: { id: "org-1" }, error: null })).toEqual({
      id: "org-1",
    });
    expect(nullWithoutActiveOrganization({ data: null, error: null })).toBeNull();
  });
});
