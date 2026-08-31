import { describe, expect, it } from "vitest";
import { policyLabelFor } from "../components/policy-acceptance-card";

const identity = (key: string) => key;

describe("policyLabelFor", () => {
  it("maps each known policy type to its own catalog key", () => {
    expect(policyLabelFor("privacy", identity)).toBe("privacy.policyAcceptance.policies.privacy");
    expect(policyLabelFor("terms", identity)).toBe("privacy.policyAcceptance.policies.terms");
  });

  // The API types this field as a bare string, so a policy the catalog does not
  // know must still render. Falling back to the raw slug keeps the row readable
  // instead of blank or key-shaped.
  it("falls back to the raw type for an unknown policy", () => {
    expect(policyLabelFor("cookies", identity)).toBe("cookies");
  });
});
