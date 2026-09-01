import { describe, expect, it } from "vitest";
import { describeImpersonation, impersonationGuard } from "../use-impersonation-guard";

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

describe("describeImpersonation", () => {
  const blocked = { blocked: true, reason: "Action unavailable", descriptionId: "reason-1" };
  const free = { blocked: false, reason: undefined, descriptionId: "reason-1" };

  it("describes the control when impersonation is what freezes it", () => {
    expect(describeImpersonation(blocked)).toEqual({
      title: "Action unavailable",
      "aria-describedby": "reason-1",
    });
  });

  it("stays silent when something else already disables the control", () => {
    expect(describeImpersonation(blocked, true)).toEqual({
      title: undefined,
      "aria-describedby": undefined,
    });
  });

  it("stays silent when there is no impersonation", () => {
    expect(describeImpersonation(free)).toEqual({
      title: undefined,
      "aria-describedby": undefined,
    });
  });
});
