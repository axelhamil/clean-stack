import { describe, expect, it } from "vitest";
import { impersonationGuard } from "../use-impersonation-guard";

describe("impersonationGuard", () => {
  it("blocks when the session is impersonated", () => {
    const guard = impersonationGuard({ session: { impersonatedBy: "admin-1" } });
    expect(guard.blocked).toBe(true);
  });

  it("allows an ordinary session", () => {
    expect(impersonationGuard({ session: {} }).blocked).toBe(false);
  });

  it("allows when there is no session at all", () => {
    expect(impersonationGuard(null).blocked).toBe(false);
  });
});
