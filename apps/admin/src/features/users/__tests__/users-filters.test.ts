import { describe, expect, it } from "vitest";
import { userQueryOf } from "../users-filters";

describe("userQueryOf", () => {
  it("asks the server for active accounts as banned=false, suspended as banned=true", () => {
    expect(userQueryOf({ status: "active" })).toEqual({ banned: "false" });
    expect(userQueryOf({ status: "suspended" })).toEqual({ banned: "true" });
  });

  it("sends nothing for blank filters, since the server refuses an empty search", () => {
    expect(userQueryOf({ q: "   ", org: " " })).toEqual({});
  });
});
