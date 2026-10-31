import { describe, expect, it } from "vitest";
import { screensOpenTo, staffViewSchema } from "../staff-views";

describe("staff view", () => {
  it("accepts the filters of its own screen", () => {
    const view = { screen: "audit", name: "Billing", filters: { action: "billing." } };

    expect(staffViewSchema.safeParse(view).success).toBe(true);
  });

  it("refuses a filter that belongs to another screen", () => {
    const view = { screen: "orgs", name: "Suspended", filters: { status: "suspended" } };

    expect(staffViewSchema.safeParse(view).success).toBe(false);
  });

  it("refuses a value the screen cannot hold", () => {
    const view = { screen: "users", name: "Odd", filters: { status: "deleted" } };

    expect(staffViewSchema.safeParse(view).success).toBe(false);
  });

  it("refuses a blank name", () => {
    expect(staffViewSchema.safeParse({ screen: "orgs", name: "  ", filters: {} }).success).toBe(
      false,
    );
  });

  it("opens only the screens the permissions read", () => {
    expect(screensOpenTo(["audit.read", "ops.read"])).toEqual(["audit"]);
  });
});
