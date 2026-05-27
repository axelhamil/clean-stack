import { describe, expect, it } from "bun:test";
import { NoOpInstrumentation } from "../services/noop-instrumentation";

describe("NoOpInstrumentation", () => {
  describe("startSpan", () => {
    it("executes a sync callback and returns its value", () => {
      const noop = new NoOpInstrumentation();
      const result = noop.startSpan({ name: "test" }, () => 42);
      expect(result).toBe(42);
    });

    it("executes an async callback and returns the awaited value", async () => {
      const noop = new NoOpInstrumentation();
      const result = await noop.startSpan({ name: "test" }, async () => "hello");
      expect(result).toBe("hello");
    });

    it("returns the same Promise instance from an async callback", async () => {
      const noop = new NoOpInstrumentation();
      const promise = Promise.resolve(99);
      const result = await noop.startSpan({ name: "test" }, () => promise);
      expect(result).toBe(99);
    });
  });

  describe("capture", () => {
    it("does not throw when called with an error", () => {
      const noop = new NoOpInstrumentation();
      expect(() => noop.capture(new Error("boom"))).not.toThrow();
    });

    it("does not throw when called without arguments", () => {
      const noop = new NoOpInstrumentation();
      expect(() => noop.capture(undefined)).not.toThrow();
    });

    it("returns void (undefined)", () => {
      const noop = new NoOpInstrumentation();
      const result = noop.capture(new Error("x"), { requestId: "r1" });
      expect(result).toBeUndefined();
    });
  });

  describe("addBreadcrumb", () => {
    it("does not throw", () => {
      const noop = new NoOpInstrumentation();
      expect(() =>
        noop.addBreadcrumb({ category: "http", message: "GET /", level: "info" }),
      ).not.toThrow();
    });

    it("returns void (undefined)", () => {
      const noop = new NoOpInstrumentation();
      const result = noop.addBreadcrumb({ message: "test" });
      expect(result).toBeUndefined();
    });
  });
});
