import { enLabel } from "@packages/web-kit/i18n/__tests__/catalog-t";
import { describe, expect, it } from "vitest";
import { USER_STATUS_LABEL_KEYS, userStatusFromBanned } from "../admin-user-labels";

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
