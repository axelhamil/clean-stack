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

  it("blocks social account linking and unlinking", () => {
    expect(isBlockedDuringImpersonation("/link-social")).toBe(true);
    expect(isBlockedDuringImpersonation("/unlink-account")).toBe(true);
  });

  it("blocks session revocation endpoints", () => {
    expect(isBlockedDuringImpersonation("/revoke-session")).toBe(true);
    expect(isBlockedDuringImpersonation("/revoke-sessions")).toBe(true);
    expect(isBlockedDuringImpersonation("/revoke-other-sessions")).toBe(true);
  });

  it("leaves read paths untouched", () => {
    expect(isBlockedDuringImpersonation("/get-session")).toBe(false);
    expect(isBlockedDuringImpersonation("/list-sessions")).toBe(false);
    expect(isBlockedDuringImpersonation("/list-accounts")).toBe(false);
  });

  it("blocks sso and scim mutations during impersonation", () => {
    expect(isBlockedDuringImpersonation("/sso/register")).toBe(true);
    expect(isBlockedDuringImpersonation("/sso/verify-domain")).toBe(true);
    expect(isBlockedDuringImpersonation("/scim/generate-token")).toBe(true);
    expect(isBlockedDuringImpersonation("/scim/v2/Users")).toBe(true);
  });

  it("still allows unrelated paths", () => {
    expect(isBlockedDuringImpersonation("/session")).toBe(false);
  });
});
