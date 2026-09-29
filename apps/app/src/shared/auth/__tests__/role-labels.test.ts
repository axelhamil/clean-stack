import { describe, expect, it } from "vitest";
import { enLabel } from "../../../shared/i18n/__tests__/catalog-t";
import { isOrgRole, ROLE_LABEL_KEYS } from "../role-labels";

describe("ROLE_LABEL_KEYS", () => {
  // `satisfies Record<OrgRole, string>` only proves every role has AN entry:
  // it does not prove each entry points at the RIGHT one. A swapped pair
  // (e.g. `owner` reading `common:roles.admin`) still type-checks, so this
  // asserts the mapping itself, not just its exhaustiveness.
  it("maps each role to its own catalog key, never a swapped one", () => {
    expect(ROLE_LABEL_KEYS).toStrictEqual({
      owner: "common:roles.owner",
      admin: "common:roles.admin",
      member: "common:roles.member",
    });
  });

  it("every key resolves to the matching English label", () => {
    expect(enLabel(ROLE_LABEL_KEYS.owner, "common")).toBe("Owner");
    expect(enLabel(ROLE_LABEL_KEYS.admin, "common")).toBe("Admin");
    expect(enLabel(ROLE_LABEL_KEYS.member, "common")).toBe("Member");
  });
});

describe("isOrgRole", () => {
  it("accepts the three known roles", () => {
    expect(isOrgRole("owner")).toBe(true);
    expect(isOrgRole("admin")).toBe(true);
    expect(isOrgRole("member")).toBe(true);
  });

  it("rejects anything else", () => {
    expect(isOrgRole("superadmin")).toBe(false);
    expect(isOrgRole("")).toBe(false);
  });
});
