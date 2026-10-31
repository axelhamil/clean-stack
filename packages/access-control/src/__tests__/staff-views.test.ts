import { describe, expect, it } from "vitest";
import { screensOpenTo, staffViewSchema, storedStaffView } from "../staff-views";

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

  it("keeps a stored view whose filters aged, dropping only the stale fields", () => {
    const view = storedStaffView({
      screen: "users",
      name: "Suspended in Acme",
      filters: { status: "deleted", org: "acme", removedField: "x" },
    });

    expect(view).toEqual({ screen: "users", name: "Suspended in Acme", filters: { org: "acme" } });
  });

  it("keeps a stored view whose filters are no longer an object", () => {
    const view = storedStaffView({ screen: "orgs", name: "Odd", filters: ["q"] });

    expect(view).toEqual({ screen: "orgs", name: "Odd", filters: {} });
  });

  it("drops a view of a screen that no longer exists", () => {
    expect(storedStaffView({ screen: "gone", name: "Old", filters: {} })).toBeUndefined();
  });

  it("opens only the screens the permissions read", () => {
    expect(screensOpenTo(["audit.read", "ops.read"])).toEqual(["audit"]);
  });
});
