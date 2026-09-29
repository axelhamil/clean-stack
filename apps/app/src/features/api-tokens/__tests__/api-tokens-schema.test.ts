import { describe, expect, it } from "vitest";
import { API_SCOPES, tokenFormSchema } from "../api-tokens.schema";

describe("tokenFormSchema", () => {
  it("accepts a valid token with required fields", () => {
    const r = tokenFormSchema.safeParse({
      name: "CI token",
      scopes: ["read:profile"],
      organizationId: null,
      expiresInDays: null,
    });
    expect(r.success).toBe(true);
  });

  it("accepts multiple valid scopes and expiry", () => {
    const r = tokenFormSchema.safeParse({
      name: "Deploy bot",
      scopes: ["read:profile", "read:organizations"],
      organizationId: "org-123",
      expiresInDays: 30,
    });
    expect(r.success).toBe(true);
  });

  it("rejects empty name", () => {
    const r = tokenFormSchema.safeParse({
      name: "",
      scopes: ["read:profile"],
      organizationId: null,
      expiresInDays: null,
    });
    expect(r.success).toBe(false);
  });

  it("rejects empty scopes array", () => {
    const r = tokenFormSchema.safeParse({
      name: "My token",
      scopes: [],
      organizationId: null,
      expiresInDays: null,
    });
    expect(r.success).toBe(false);
  });

  it("rejects an unknown scope", () => {
    const r = tokenFormSchema.safeParse({
      name: "My token",
      scopes: ["admin:everything"],
      organizationId: null,
      expiresInDays: null,
    });
    expect(r.success).toBe(false);
  });

  it("rejects a non-positive expiry", () => {
    const r = tokenFormSchema.safeParse({
      name: "My token",
      scopes: ["read:profile"],
      organizationId: null,
      expiresInDays: 0,
    });
    expect(r.success).toBe(false);
  });

  it("rejects name exceeding 100 characters", () => {
    const r = tokenFormSchema.safeParse({
      name: "a".repeat(101),
      scopes: ["read:profile"],
      organizationId: null,
      expiresInDays: null,
    });
    expect(r.success).toBe(false);
  });
});

describe("API_SCOPES", () => {
  it("contains the three documented scopes", () => {
    expect(API_SCOPES).toContain("read:profile");
    expect(API_SCOPES).toContain("write:profile");
    expect(API_SCOPES).toContain("read:organizations");
    expect(API_SCOPES).toHaveLength(3);
  });
});
