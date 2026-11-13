import { describe, expect, it } from "bun:test";
import { isolationCanary } from "./module-isolation-canary";

// Half of the isolation canary: its `.1-` sibling replaced this module. If that
// replacement is visible here, test files are sharing one module registry and
// every mock in the suite is order-dependent. See `module-isolation-canary.ts`.
describe("module isolation canary (bystander)", () => {
  it("still resolves the real module another file replaced", () => {
    expect(isolationCanary).toBe("real");
  });
});
