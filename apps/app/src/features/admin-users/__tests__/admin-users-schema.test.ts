import { describe, expect, it } from "vitest";
import { banFormSchema, impersonateFormSchema } from "../admin-users.schema";

describe("impersonateFormSchema", () => {
  it("rejects an empty reason", () => {
    expect(impersonateFormSchema.safeParse({ reason: "   " }).success).toBe(false);
  });

  it("accepts a reason with an optional ticket reference", () => {
    const parsed = impersonateFormSchema.parse({ reason: "broken upload", ticketRef: "SUP-42" });
    expect(parsed.ticketRef).toBe("SUP-42");
  });
});

describe("banFormSchema", () => {
  it("rejects an empty reason", () => {
    expect(banFormSchema.safeParse({ reason: "" }).success).toBe(false);
  });

  it("rejects a non-positive expiry", () => {
    expect(banFormSchema.safeParse({ reason: "spam", expiresIn: 0 }).success).toBe(false);
  });

  it("rejects a whitespace-only reason", () => {
    expect(banFormSchema.safeParse({ reason: "   " }).success).toBe(false);
  });
});
