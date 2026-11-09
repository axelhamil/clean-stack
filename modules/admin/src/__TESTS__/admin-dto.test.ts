import { describe, expect, it } from "bun:test";
import { listUsersQuerySchema } from "../application/dto/list-users.dto";
import { setStaffOverrideBodySchema } from "../application/dto/staff-override.dto";

describe("listUsersQuerySchema", () => {
  it("reads banned=false as active accounts, not as banned ones", () => {
    expect(listUsersQuerySchema.parse({ banned: "false" }).banned).toBe(false);
    expect(listUsersQuerySchema.parse({ banned: "true" }).banned).toBe(true);
  });
});

describe("setStaffOverrideBodySchema", () => {
  const body = { permission: "audit.read", effect: "grant" };

  it("refuses an expiry already past", () => {
    const parsed = setStaffOverrideBodySchema.safeParse({
      ...body,
      expiresAt: "2001-01-01T00:00:00.000Z",
    });

    expect(parsed.success).toBe(false);
  });

  it("accepts no expiry and a future one", () => {
    const future = new Date(Date.now() + 60_000).toISOString();

    expect(setStaffOverrideBodySchema.safeParse({ ...body, expiresAt: null }).success).toBe(true);
    expect(setStaffOverrideBodySchema.safeParse({ ...body, expiresAt: future }).success).toBe(true);
  });
});
