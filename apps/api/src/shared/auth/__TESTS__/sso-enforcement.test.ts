import { describe, expect, it } from "bun:test";
import { Option } from "@packages/ddd-kit";
import { domainOf, isSsoEnforcedFor } from "../sso-enforcement";

const enforced = { providerId: "acme-oidc", organizationId: "org-1" };
const lookupFound = async () => Option.some(enforced);
const lookupEmpty = async () => Option.none<typeof enforced>();

describe("domainOf", () => {
  it("lowercases the domain", () => {
    expect(domainOf("Jane@ACME.com")).toBe("acme.com");
  });

  it("returns null on a malformed address", () => {
    expect(domainOf("not-an-email")).toBeNull();
    expect(domainOf("")).toBeNull();
    expect(domainOf("a@b@c")).toBeNull();
  });
});

describe("isSsoEnforcedFor", () => {
  it("returns the provider when the domain is enforced", async () => {
    const result = await isSsoEnforcedFor("jane@acme.com", lookupFound);
    expect(result.isSome()).toBe(true);
    expect(result.unwrap()).toEqual(enforced);
  });

  it("returns none when no provider matches", async () => {
    const result = await isSsoEnforcedFor("jane@other.com", lookupEmpty);
    expect(result.isNone()).toBe(true);
  });

  it("returns none on a malformed address without hitting the lookup", async () => {
    let called = false;
    const spy = async () => {
      called = true;
      return Option.some(enforced);
    };
    const result = await isSsoEnforcedFor("garbage", spy);
    expect(result.isNone()).toBe(true);
    expect(called).toBe(false);
  });
});
