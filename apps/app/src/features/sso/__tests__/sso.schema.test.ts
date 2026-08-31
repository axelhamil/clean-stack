import { describe, expect, it } from "vitest";
import type { z } from "zod";
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

// A per-issue `message:` wins over the global Zod map (shared/CLAUDE.md:40), so a
// schema that carries one is permanently English. Asserting on `code`/`params`
// rather than on rendered text is what makes this a rule check and not a copy test.
function issuesFor(schema: z.ZodType, input: unknown) {
  const result = schema.safeParse(input);
  return result.success ? [] : result.error.issues;
}

describe("sso schemas route their copy through the catalog", () => {
  it("rejects a bare-domain violation with an i18nKey, not a message", () => {
    const issues = issuesFor(oidcProviderSchema, {
      domain: "https://acme.com/sso",
      issuer: "https://idp.acme.com",
      clientId: "id",
      clientSecret: "secret",
    });
    const domainIssue = issues.find((i) => i.path[0] === "domain");
    expect(domainIssue?.code).toBe("custom");
    // Narrowed on the discriminant rather than cast: `$ZodIssue` is a union keyed
    // on `code`, so the conditional gives real access to `params`. A cast would
    // assert the shape instead of proving it, and would still compile if the
    // check above ever stopped holding.
    expect(domainIssue?.code === "custom" ? domainIssue.params : undefined).toEqual({
      i18nKey: "validation.bareDomain",
    });
  });

  it("rejects a non-https issuer with an i18nKey, not a message", () => {
    const issues = issuesFor(oidcProviderSchema, {
      domain: "acme.com",
      issuer: "http://idp.acme.com",
      clientId: "id",
      clientSecret: "secret",
    });
    const issuerIssue = issues.find((i) => i.path[0] === "issuer");
    expect(issuerIssue?.code).toBe("custom");
    // Narrowed on the discriminant rather than cast: `$ZodIssue` is a union keyed
    // on `code`, so the conditional gives real access to `params`. A cast would
    // assert the shape instead of proving it, and would still compile if the
    // check above ever stopped holding.
    expect(issuerIssue?.code === "custom" ? issuerIssue.params : undefined).toEqual({
      i18nKey: "validation.httpsUrl",
    });
  });

  it("rejects a non-https SAML entry point with an i18nKey", () => {
    const issues = issuesFor(samlProviderSchema, {
      domain: "acme.com",
      entryPoint: "http://idp.acme.com/sso/saml",
      issuer: "acme-saml",
      cert: "PEM",
    });
    const entryIssue = issues.find((i) => i.path[0] === "entryPoint");
    expect(entryIssue?.code).toBe("custom");
    // Narrowed on the discriminant rather than cast: `$ZodIssue` is a union keyed
    // on `code`, so the conditional gives real access to `params`. A cast would
    // assert the shape instead of proving it, and would still compile if the
    // check above ever stopped holding.
    expect(entryIssue?.code === "custom" ? entryIssue.params : undefined).toEqual({
      i18nKey: "validation.httpsUrl",
    });
  });

  it("leaves an empty certificate to the global required message", () => {
    const issues = issuesFor(samlProviderSchema, {
      domain: "acme.com",
      entryPoint: "https://idp.acme.com/sso/saml",
      issuer: "acme-saml",
      cert: "",
    });
    const certIssue = issues.find((i) => i.path[0] === "cert");
    expect(certIssue?.code).toBe("too_small");
    expect(certIssue?.message).not.toBe("Paste the IdP signing certificate");
  });
});
