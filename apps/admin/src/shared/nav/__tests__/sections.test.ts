import { describe, expect, it } from "vitest";
import { isSectionPath, sectionOpenTo, sectionsOpenTo } from "../sections";

const ids = (permissions: Parameters<typeof sectionsOpenTo>[0]) =>
  sectionsOpenTo(permissions).map((section) => section.id);

describe("sectionsOpenTo", () => {
  it("shows only what the permissions the server returned open", () => {
    expect(ids(["users.read", "audit.read"])).toEqual(["users", "audit"]);
  });

  it("shows nothing without a permission that opens a section", () => {
    expect(ids([])).toEqual([]);
    expect(ids(["users.moderate"])).toEqual([]);
  });

  it("follows a denied permission rather than any role", () => {
    expect(ids(["orgs.read", "ops.read"])).toEqual(["orgs", "operations"]);
    expect(ids(["orgs.read"])).toEqual(["orgs"]);
  });
});

describe("sectionOpenTo", () => {
  it("opens a section the permissions allow", () => {
    expect(sectionOpenTo("team", ["staff.manage"])?.id).toBe("team");
  });

  it("answers the same for a forbidden section and one that does not exist", () => {
    expect(sectionOpenTo("team", ["audit.read"])).toBeUndefined();
    expect(sectionOpenTo("nope", ["audit.read"])).toBeUndefined();
  });
});

describe("isSectionPath", () => {
  it("keeps a section highlighted on its detail pages, and not on a section with the same start", () => {
    expect(isSectionPath("/users/abc", "users")).toBe(true);
    expect(isSectionPath("/users", "users")).toBe(true);
    expect(isSectionPath("/users-archive", "users")).toBe(false);
  });
});
