import { describe, expect, it } from "vitest";
import { billingSearchSchema } from "../billing.schema";

describe("billingSearchSchema", () => {
  it.each([1, "1"])("recognises the checkout return flag %j", (upgraded) => {
    expect(billingSearchSchema.parse({ upgraded }).upgraded).toBeDefined();
  });

  it.each([0, "yes", null, undefined])("ignores %j", (upgraded) => {
    expect(billingSearchSchema.parse({ upgraded }).upgraded).toBeUndefined();
  });
});
