import { describe, expect, it } from "bun:test";
import { changedFieldsFrom, isSamlCallbackPath, scimUserChange } from "../sso-paths";

describe("scimUserChange", () => {
  it("names a creation and a deletion by their method alone", () => {
    expect(scimUserChange("POST", undefined, { active: true })).toBe("created");
    expect(scimUserChange("DELETE", { active: true }, undefined)).toBe("deprovisioned");
  });

  it("detects a deactivation from the stored state, whatever the body shape", () => {
    expect(scimUserChange("PATCH", { active: true }, { active: false })).toBe("deactivated");
    expect(scimUserChange("PUT", { active: true }, { active: false })).toBe("deactivated");
  });

  it("treats a reactivation and an attribute change as updates", () => {
    expect(scimUserChange("PATCH", { active: false }, { active: true })).toBe("updated");
    expect(scimUserChange("PUT", { active: true }, { active: true })).toBe("updated");
  });

  it("ignores reads", () => {
    expect(scimUserChange("GET", { active: true }, { active: true })).toBeNull();
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

describe("isSamlCallbackPath", () => {
  it("recognizes the SAML assertion consumer service", () => {
    expect(isSamlCallbackPath("/sso/saml2/sp/acs/:providerId")).toBe(true);
    expect(isSamlCallbackPath("/sso/callback/:providerId")).toBe(false);
  });
});
