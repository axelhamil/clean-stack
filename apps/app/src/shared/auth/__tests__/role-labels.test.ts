import { enCatalog } from "@packages/i18n";
import { describe, expect, it } from "vitest";
import { isOrgRole, ROLE_LABEL_KEYS } from "../role-labels";

function resolve(prefixedKey: string): string | undefined {
  const [namespace, path] = prefixedKey.split(":");
  if (namespace !== "common" || path === undefined) return undefined;
  let cur: unknown = enCatalog.common;
  for (const seg of path.split(".")) {
    if (typeof cur !== "object" || cur === null) return undefined;
    cur = (cur as Record<string, unknown>)[seg];
  }
  return typeof cur === "string" ? cur : undefined;
}

describe("ROLE_LABEL_KEYS", () => {
  // `satisfies Record<OrgRole, string>` only proves every role has AN entry —
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
    expect(resolve(ROLE_LABEL_KEYS.owner)).toBe("Owner");
    expect(resolve(ROLE_LABEL_KEYS.admin)).toBe("Admin");
    expect(resolve(ROLE_LABEL_KEYS.member)).toBe("Member");
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
