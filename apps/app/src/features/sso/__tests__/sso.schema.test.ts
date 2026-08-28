import { describe, expect, it } from "vitest";
import { oidcProviderSchema, samlProviderSchema } from "../sso.schema";

describe("oidcProviderSchema", () => {
  it("accepts an https issuer with a domain", () => {
    const result = oidcProviderSchema.safeParse({
      domain: "acme.com",
      issuer: "https://idp.acme.com",
      clientId: "abc",
      clientSecret: "shh",
    });
    expect(result.success).toBe(true);
  });

  it("rejects a plaintext issuer", () => {
    const result = oidcProviderSchema.safeParse({
      domain: "acme.com",
      issuer: "http://idp.acme.com",
      clientId: "abc",
      clientSecret: "shh",
    });
    expect(result.success).toBe(false);
  });

  it("rejects a domain with a scheme in it", () => {
    const result = oidcProviderSchema.safeParse({
      domain: "https://acme.com",
      issuer: "https://idp.acme.com",
      clientId: "abc",
      clientSecret: "shh",
    });
    expect(result.success).toBe(false);
  });
});

describe("samlProviderSchema", () => {
  it("requires an entry point and a certificate", () => {
    expect(samlProviderSchema.safeParse({ domain: "acme.com" }).success).toBe(false);
  });
});
