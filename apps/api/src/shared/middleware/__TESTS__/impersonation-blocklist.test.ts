import { describe, expect, it } from "bun:test";
import { isBlockedDuringImpersonation } from "../impersonation-blocklist";

describe("isBlockedDuringImpersonation", () => {
  it("blocks credential and identity mutations", () => {
    for (const path of [
      "/change-password",
      "/change-email",
      "/update-user",
      "/delete-user",
      "/two-factor/enable",
      "/two-factor/disable",
      "/passkey/generate-register-options",
    ]) {
      expect(isBlockedDuringImpersonation(path)).toBe(true);
    }
  });

  it("blocks admin endpoints to prevent privilege escalation", () => {
    expect(isBlockedDuringImpersonation("/admin/ban-user")).toBe(true);
    expect(isBlockedDuringImpersonation("/admin/impersonate-user")).toBe(true);
  });

  it("always allows stopping the impersonation", () => {
    expect(isBlockedDuringImpersonation("/admin/stop-impersonating")).toBe(false);
  });

  it("leaves read paths untouched", () => {
    expect(isBlockedDuringImpersonation("/get-session")).toBe(false);
  });
});
