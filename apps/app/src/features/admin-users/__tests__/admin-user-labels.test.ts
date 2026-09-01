import { enCatalog } from "@packages/i18n";
import { describe, expect, it } from "vitest";
import {
  isPlatformRole,
  PLATFORM_ROLE_LABEL_KEYS,
  USER_STATUS_LABEL_KEYS,
  userStatusFromBanned,
} from "../admin-user-labels";

// Cross-namespace entries carry an explicit `ns:` prefix (`common:roles.admin`);
// same-namespace entries stay bare and resolve against `admin`, matching how
// the call sites read them.
function resolve(key: string): string | undefined {
  const [namespace, path] = key.includes(":") ? key.split(":") : ["admin", key];
  if (namespace === undefined || path === undefined) return undefined;
  let cur: unknown = (enCatalog as Record<string, unknown>)[namespace];
  for (const seg of path.split(".")) {
    if (typeof cur !== "object" || cur === null) return undefined;
    cur = (cur as Record<string, unknown>)[seg];
  }
  return typeof cur === "string" ? cur : undefined;
}

describe("PLATFORM_ROLE_LABEL_KEYS", () => {
  // `satisfies Record<PlatformRole, string>` only proves every role has AN
  // entry — it does not prove each entry points at the RIGHT one. A swapped
  // pair (e.g. `admin` reading `admin:users.roleUser`) still type-checks, so
  // this asserts the mapping itself, not just its exhaustiveness.
  it("maps each role to its own catalog key, never a swapped one", () => {
    expect(PLATFORM_ROLE_LABEL_KEYS).toStrictEqual({
      admin: "common:roles.admin",
      user: "users.roleUser",
    });
  });

  it("every key resolves to the matching English label", () => {
    expect(resolve(PLATFORM_ROLE_LABEL_KEYS.admin)).toBe("Admin");
    expect(resolve(PLATFORM_ROLE_LABEL_KEYS.user)).toBe("User");
  });
});

describe("isPlatformRole", () => {
  it("accepts the two known platform roles", () => {
    expect(isPlatformRole("admin")).toBe(true);
    expect(isPlatformRole("user")).toBe(true);
  });

  it("rejects anything else", () => {
    expect(isPlatformRole("owner")).toBe(false);
    expect(isPlatformRole("")).toBe(false);
  });
});

describe("USER_STATUS_LABEL_KEYS", () => {
  it("maps each status to its own catalog key, never a swapped one", () => {
    expect(USER_STATUS_LABEL_KEYS).toStrictEqual({
      active: "users.status.active",
      suspended: "users.status.suspended",
    });
  });

  it("every key resolves to the matching English label", () => {
    expect(resolve(USER_STATUS_LABEL_KEYS.active)).toBe("Active");
    expect(resolve(USER_STATUS_LABEL_KEYS.suspended)).toBe("Suspended");
  });
});

describe("userStatusFromBanned", () => {
  it("returns suspended when banned", () => {
    expect(userStatusFromBanned(true)).toBe("suspended");
  });

  it("returns active when not banned", () => {
    expect(userStatusFromBanned(false)).toBe("active");
  });
});
