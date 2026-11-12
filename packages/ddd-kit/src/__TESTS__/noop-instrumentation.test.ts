import { describe, expect, it } from "vitest";
import { NoOpInstrumentation } from "../application/noop-instrumentation";

describe("NoOpInstrumentation", () => {
  it("returns the value of a sync callback from startSpan", () => {
    expect(new NoOpInstrumentation().startSpan({ name: "test" }, () => 42)).toBe(42);
  });

  it("resolves the value of an async callback from startSpan", async () => {
    const result = await new NoOpInstrumentation().startSpan({ name: "test" }, async () => "hello");

    expect(result).toBe("hello");
  });

  it("resolves flush to true", async () => {
    expect(await new NoOpInstrumentation().flush(1000)).toBe(true);
  });
});
