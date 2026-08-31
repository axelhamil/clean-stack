import enCatalog from "@packages/i18n/src/catalogs/en";
import { describe, expect, it } from "vitest";
import { isSsoProviderType, SSO_PROVIDER_TYPE_KEYS } from "../sso-labels";

function resolve(key: string): string | undefined {
  let cur: unknown = enCatalog.settings;
  for (const seg of key.split(".")) {
    if (typeof cur !== "object" || cur === null) return undefined;
    cur = (cur as Record<string, unknown>)[seg];
  }
  return typeof cur === "string" ? cur : undefined;
}

describe("SSO_PROVIDER_TYPE_KEYS", () => {
  // `satisfies Record<SsoProviderType, string>` only proves every type has AN
  // entry — it does not prove each one points at the RIGHT one. A swapped
  // pair (e.g. `oidc` reading the `saml` key) still type-checks, so this
  // asserts the mapping itself, not just its exhaustiveness.
  it("maps each provider type to its own catalog key, never a swapped one", () => {
    expect(SSO_PROVIDER_TYPE_KEYS).toStrictEqual({
      oidc: "sso.providerCard.type.oidc",
      saml: "sso.providerCard.type.saml",
    });
  });

  it("every key resolves to the matching English label", () => {
    expect(resolve(SSO_PROVIDER_TYPE_KEYS.oidc)).toBe("OIDC");
    expect(resolve(SSO_PROVIDER_TYPE_KEYS.saml)).toBe("SAML");
  });
});

describe("isSsoProviderType", () => {
  it("accepts the two known provider types", () => {
    expect(isSsoProviderType("oidc")).toBe(true);
    expect(isSsoProviderType("saml")).toBe(true);
  });

  it("rejects anything else", () => {
    expect(isSsoProviderType("ldap")).toBe(false);
    expect(isSsoProviderType("")).toBe(false);
  });
});
