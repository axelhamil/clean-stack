import { describe, expect, it } from "bun:test";
import { setPlanOverrideBodySchema } from "../../../infra/http/routes/admin-orgs/admin-orgs.schema";

const YEAR_MS = 365 * 24 * 60 * 60 * 1000;
const valid = {
  tier: "pro",
  expiresAt: new Date(Date.now() + YEAR_MS).toISOString(),
  note: "Pilot",
};

describe("setPlanOverrideBodySchema", () => {
  it("accepts a paid tier within the bound", () => {
    expect(setPlanOverrideBodySchema.safeParse(valid).success).toBe(true);
  });

  it("refuses free: it would hide the self-service portal of an org still billed", () => {
    expect(setPlanOverrideBodySchema.safeParse({ ...valid, tier: "free" }).success).toBe(false);
  });

  it("refuses an end date past the 10-year bound the screen enforces", () => {
    const expiresAt = new Date(Date.now() + 12 * YEAR_MS).toISOString();

    expect(setPlanOverrideBodySchema.safeParse({ ...valid, expiresAt }).success).toBe(false);
  });
});
