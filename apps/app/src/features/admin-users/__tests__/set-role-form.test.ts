import { describe, expect, it } from "vitest";
import { setRoleFormSchema } from "../admin-users.schema";

describe("setRoleFormSchema", () => {
  it("accepts the two known platform roles", () => {
    expect(setRoleFormSchema.safeParse({ role: "admin" }).success).toBe(true);
    expect(setRoleFormSchema.safeParse({ role: "user" }).success).toBe(true);
  });

  it("rejects any other role", () => {
    expect(setRoleFormSchema.safeParse({ role: "owner" }).success).toBe(false);
    expect(setRoleFormSchema.safeParse({ role: "" }).success).toBe(false);
  });

  it("rejects a missing role", () => {
    expect(setRoleFormSchema.safeParse({}).success).toBe(false);
  });
});
