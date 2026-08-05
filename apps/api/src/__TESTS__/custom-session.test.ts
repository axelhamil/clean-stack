import { describe, expect, it } from "bun:test";
import { buildSessionPayload } from "../auth-session-payload";

describe("buildSessionPayload", () => {
  it("exposes the impersonator id when the session is impersonated", () => {
    const payload = buildSessionPayload(
      { id: "u-1", role: "user", twoFactorEnabled: false },
      { id: "s-1", impersonatedBy: "admin-1", activeOrganizationId: null },
      [],
    );
    expect(payload.session.impersonatedBy).toBe("admin-1");
  });

  it("returns null for a regular session", () => {
    const payload = buildSessionPayload(
      { id: "u-1", role: "user", twoFactorEnabled: false },
      { id: "s-1", impersonatedBy: null, activeOrganizationId: null },
      [],
    );
    expect(payload.session.impersonatedBy).toBeNull();
  });
});
