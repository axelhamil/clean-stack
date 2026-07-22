import { describe, expect, it } from "vitest";
import { serializeFilters } from "../audit-log-filters";

describe("serializeFilters", () => {
  it("drops empty fields and keeps set ones", () => {
    expect(
      serializeFilters({ actionPrefix: "user.", actorId: "", organizationId: "org-1" }),
    ).toEqual({
      actionPrefix: "user.",
      organizationId: "org-1",
    });
  });
});
