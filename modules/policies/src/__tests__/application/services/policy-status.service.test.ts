import { describe, expect, it } from "bun:test";
import { POLICY_TYPES, POLICY_VERSIONS } from "@packages/policies";
import {
  policyStatusFrom,
  staleTypesOf,
} from "../../../application/services/policy-status.service";

describe("policy status", () => {
  it("holds a policy accepted at its current version as current", () => {
    const status = policyStatusFrom(POLICY_VERSIONS);

    expect(status.privacy.current).toBe(true);
    expect(status.privacy.acceptedVersion.toNull()).toBe(POLICY_VERSIONS.privacy);
    expect(staleTypesOf(status)).toEqual([]);
  });

  it("holds a policy accepted at an older version as stale, with that version", () => {
    const status = policyStatusFrom({ privacy: POLICY_VERSIONS.privacy, terms: "2020-01-01" });

    expect(status.terms.current).toBe(false);
    expect(status.terms.acceptedVersion.toNull()).toBe("2020-01-01");
    expect(staleTypesOf(status)).toEqual(["terms"]);
  });

  it("holds a policy never accepted as stale, with no version", () => {
    const status = policyStatusFrom({});

    for (const type of POLICY_TYPES) {
      expect(status[type].current).toBe(false);
      expect(status[type].acceptedVersion.isSome()).toBe(false);
    }
    expect(staleTypesOf(status)).toEqual([...POLICY_TYPES]);
  });
});
