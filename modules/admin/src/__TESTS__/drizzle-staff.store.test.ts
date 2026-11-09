import { describe, expect, it } from "bun:test";
import { Option } from "@packages/ddd-kit";
import { overrideOf, sourceOf } from "../infrastructure/repositories/drizzle-staff.store";

describe("staff row parsing", () => {
  it("fails closed on an unknown source", () => {
    expect(sourceOf("env").unwrap()).toBe("env");
    expect(sourceOf("console").unwrap()).toBe("console");
    expect(sourceOf("migration").unwrap()).toBe("migration");
    expect(sourceOf("legacy").isNone()).toBe(true);
  });

  it("never reads an unknown effect as a grant", () => {
    const row = { permission: "audit.read", effect: "maybe", expiresAt: null };

    expect(overrideOf(row).unwrap().effect).toBe("deny");
  });

  it("keeps a real grant and drops an unknown permission", () => {
    const grant = { permission: "audit.read", effect: "grant", expiresAt: null };

    expect(overrideOf(grant).unwrap()).toEqual({
      permission: "audit.read",
      effect: "grant",
      expiresAt: Option.none(),
    });
    expect(overrideOf({ ...grant, permission: "root" }).isNone()).toBe(true);
  });
});
