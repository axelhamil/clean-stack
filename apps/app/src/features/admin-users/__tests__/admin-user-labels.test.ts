import { describe, expect, it } from "vitest";
import { enLabel } from "../../../shared/i18n/__tests__/catalog-t";
import {
  isPlatformRole,
  PLATFORM_ROLE_LABEL_KEYS,
  USER_STATUS_LABEL_KEYS,
  userStatusFromBanned,
} from "../admin-user-labels";

describe("PLATFORM_ROLE_LABEL_KEYS", () => {
  // `satisfies Record<PlatformRole, string>` only proves every role has AN
  // entry, not that each entry points at the RIGHT one. A swapped
  // pair (e.g. `admin` reading `admin:users.roleUser`) still type-checks, so
  // this asserts the mapping itself, not just its exhaustiveness.
  it("maps each role to its own catalog key, never a swapped one", () => {
    expect(PLATFORM_ROLE_LABEL_KEYS).toStrictEqual({
      admin: "common:roles.admin",
      user: "users.roleUser",
    });
  });

  it("every key resolves to the matching English label", () => {
    expect(enLabel(PLATFORM_ROLE_LABEL_KEYS.admin, "admin")).toBe("Admin");
    expect(enLabel(PLATFORM_ROLE_LABEL_KEYS.user, "admin")).toBe("User");
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
    expect(enLabel(USER_STATUS_LABEL_KEYS.active, "admin")).toBe("Active");
    expect(enLabel(USER_STATUS_LABEL_KEYS.suspended, "admin")).toBe("Suspended");
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
