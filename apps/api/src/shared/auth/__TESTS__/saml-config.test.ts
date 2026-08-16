import { describe, expect, it } from "bun:test";
import { normalizeSamlConfig } from "../saml-config";

describe("normalizeSamlConfig", () => {
  it("forces assertion and request signing", () => {
    const result = normalizeSamlConfig({ entryPoint: "https://idp.acme.com/sso", cert: "MII…" });
    expect(result.isSuccess).toBe(true);
    expect(result.getValue()).toMatchObject({
      wantAssertionsSigned: true,
      authnRequestsSigned: true,
      signatureAlgorithm: "sha256",
      digestAlgorithm: "sha256",
    });
  });

  it("overrides a caller-supplied weakening of the signing flags", () => {
    const result = normalizeSamlConfig({ cert: "MII…", wantAssertionsSigned: false });
    expect(result.getValue().wantAssertionsSigned).toBe(true);
  });

  it("rejects sha1 outright rather than silently upgrading it", () => {
    const result = normalizeSamlConfig({ cert: "MII…", signatureAlgorithm: "sha1" });
    expect(result.isFailure).toBe(true);
    expect(result.getError().code).toBe("WEAK_SIGNATURE_ALGORITHM");
  });

  it("preserves fields it does not govern", () => {
    const result = normalizeSamlConfig({ cert: "MII…", audience: "https://app.example.com" });
    expect(result.getValue().audience).toBe("https://app.example.com");
  });
});
