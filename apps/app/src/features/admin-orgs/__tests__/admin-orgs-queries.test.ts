import { describe, expect, it } from "vitest";
import {
  adminOrgDetailQueryOptions,
  adminOrgsInfiniteQueryOptions,
} from "../api/admin-orgs.queries";

describe("admin orgs query options", () => {
  it("keys the list by its search term", () => {
    expect(adminOrgsInfiniteQueryOptions("acme").queryKey).toEqual([
      "admin",
      "orgs",
      "list",
      "acme",
    ]);
  });

  it("keys the detail by org id", () => {
    expect(adminOrgDetailQueryOptions("o-1").queryKey).toEqual(["admin", "orgs", "detail", "o-1"]);
  });
});
