import { describe, expect, it } from "bun:test";
import { changedFieldsFrom, isDeactivation, scimProviderIdFromToken } from "../sso-paths";

describe("isDeactivation", () => {
  it("detects the entra id patch shape", () => {
    expect(isDeactivation({ Operations: [{ op: "replace", path: "active", value: false }] })).toBe(
      true,
    );
  });

  it("detects the top-level put shape", () => {
    expect(isDeactivation({ active: false })).toBe(true);
  });

  it("does not fire on reactivation", () => {
    expect(isDeactivation({ active: true })).toBe(false);
    expect(isDeactivation({ Operations: [{ op: "replace", path: "active", value: true }] })).toBe(
      false,
    );
  });
});

describe("changedFieldsFrom", () => {
  it("lists patch operation paths", () => {
    expect(
      changedFieldsFrom({ Operations: [{ path: "displayName" }, { path: "active" }] }),
    ).toEqual(["displayName", "active"]);
  });

  it("drops the schemas envelope on a put", () => {
    expect(changedFieldsFrom({ schemas: ["urn:…"], displayName: "A" })).toEqual(["displayName"]);
  });
});

describe("scimProviderIdFromToken", () => {
  it("reads the provider id out of the encoded token", () => {
    const token = btoa("secret:acme-scim:org-1");
    const headers = new Headers({ authorization: `Bearer ${token}` });
    expect(scimProviderIdFromToken(headers)).toBe("acme-scim");
  });

  it("degrades to unknown on garbage", () => {
    expect(scimProviderIdFromToken(new Headers({ authorization: "Bearer !!!" }))).toBe("unknown");
  });
});
