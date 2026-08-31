import { POLICY_TYPES } from "@packages/policies";
import { describe, expect, it } from "vitest";
import { isPolicyType, POLICY_TITLE_KEYS, policyLabelFor } from "../policy-labels";

describe("POLICY_TITLE_KEYS", () => {
  // `satisfies Record<PolicyType, string>` proves every type has a key. It
  // cannot prove privacy points at the privacy copy — swapping the two
  // entries type-checks and renders. Only naming each pair catches that.
  it("points each policy type at its own title key", () => {
    expect(POLICY_TITLE_KEYS).toStrictEqual({
      privacy: "legal.policies.privacyTitle",
      terms: "legal.policies.termsTitle",
    });
  });

  it("covers every type in POLICY_TYPES, with no orphan entry", () => {
    expect(Object.keys(POLICY_TITLE_KEYS).toSorted()).toEqual([...POLICY_TYPES].toSorted());
  });
});

describe("isPolicyType", () => {
  it("accepts every known policy type", () => {
    for (const type of POLICY_TYPES) {
      expect(isPolicyType(type)).toBe(true);
    }
  });

  it("rejects a type the register doesn't know", () => {
    expect(isPolicyType("cookies")).toBe(false);
    expect(isPolicyType("")).toBe(false);
  });
});

describe("policyLabelFor", () => {
  const identity = (key: string) => key;

  it("maps each known policy type to its own catalog key", () => {
    expect(policyLabelFor("privacy", identity)).toBe("legal.policies.privacyTitle");
    expect(policyLabelFor("terms", identity)).toBe("legal.policies.termsTitle");
  });

  it("falls back to the raw type for an unknown policy", () => {
    expect(policyLabelFor("cookies", identity)).toBe("cookies");
  });
});
