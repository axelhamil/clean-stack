import { describe, expect, it, mock } from "bun:test";
import { isolationCanary } from "./module-isolation-canary";

// Half of the isolation canary: this file replaces a module, its `.2-` sibling
// asserts the replacement never reached it. See `module-isolation-canary.ts`.
mock.module("./module-isolation-canary", () => ({ isolationCanary: "replaced" }));

describe("module isolation canary (replacer)", () => {
  it("sees its own replacement", () => {
    expect(isolationCanary).toBe("replaced");
  });
});
