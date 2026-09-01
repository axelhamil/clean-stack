import { describe, expect, it } from "vitest";
import { tokenScopeDisplay } from "../token-scope";

const ACTIVE_ORG = { id: "org-active", name: "Acme" };

describe("tokenScopeDisplay", () => {
  it("labels an org-less token as personal", () => {
    expect(tokenScopeDisplay(null, ACTIVE_ORG)).toEqual({ kind: "personal" });
  });

  it("names the organization when the token belongs to the active one", () => {
    expect(tokenScopeDisplay("org-active", ACTIVE_ORG)).toEqual({
      kind: "organization",
      name: "Acme",
    });
  });

  it("stays generic rather than mislabelling a token from another organization", () => {
    expect(tokenScopeDisplay("org-other", ACTIVE_ORG)).toEqual({
      kind: "organization",
      name: null,
    });
  });

  it("stays generic while the active organization is still loading", () => {
    expect(tokenScopeDisplay("org-active", undefined)).toEqual({
      kind: "organization",
      name: null,
    });
  });
});
