import { describe, expect, it } from "vitest";
import { Result } from "../primitives/result";

describe("Result", () => {
  describe("ok()", () => {
    it("should create a success result with value", () => {
      const result = Result.ok(42);

      expect(result.isSuccess).toBe(true);
      expect(result.isFailure).toBe(false);
      expect(result.getValue()).toBe(42);
    });

    it("should create a success result with undefined value", () => {
      const result = Result.ok();

      expect(result.isSuccess).toBe(true);
      expect(result.isFailure).toBe(false);
      expect(result.getValue()).toBeUndefined();
    });

    it("should create a success result with complex object", () => {
      const value = { name: "test", count: 5 };
      const result = Result.ok(value);

      expect(result.isSuccess).toBe(true);
      expect(result.getValue()).toEqual(value);
    });

    it("should create a success result with null value", () => {
      const result = Result.ok(null);

      expect(result.isSuccess).toBe(true);
      expect(result.getValue()).toBeNull();
    });
  });

  describe("fail()", () => {
    it("should create a failure result with error string", () => {
      const result = Result.fail("error message");

      expect(result.isSuccess).toBe(false);
      expect(result.isFailure).toBe(true);
      expect(result.getError()).toBe("error message");
    });

    it("should create a failure result with custom error type", () => {
      const error = { code: "ERR_001", message: "Custom error" };
      const result = Result.fail<number, typeof error>(error);

      expect(result.isFailure).toBe(true);
      expect(result.getError()).toEqual(error);
    });

    it("should create a failure result with Error object", () => {
      const error = new Error("Something went wrong");
      const result = Result.fail<string, Error>(error);

      expect(result.isFailure).toBe(true);
      expect(result.getError()).toBeInstanceOf(Error);
      expect(result.getError().message).toBe("Something went wrong");
    });
  });

  describe("getValue()", () => {
    it("should return the value on success", () => {
      const result = Result.ok("test value");

      expect(result.getValue()).toBe("test value");
    });

    it("should throw when called on failure", () => {
      const result = Result.fail("error");

      expect(() => result.getValue()).toThrow("Can't get value from failure result");
    });
  });

  describe("getError()", () => {
    it("should return the error on failure", () => {
      const result = Result.fail("error message");

      expect(result.getError()).toBe("error message");
    });

    it("should throw when called on success", () => {
      const result = Result.ok(42);

      expect(() => result.getError()).toThrow("Can't get error from success result");
    });
  });

  describe("isSuccess / isFailure", () => {
    it("should have mutually exclusive states", () => {
      const success = Result.ok(1);
      const failure = Result.fail("error");

      expect(success.isSuccess).toBe(true);
      expect(success.isFailure).toBe(false);
      expect(failure.isSuccess).toBe(false);
      expect(failure.isFailure).toBe(true);
    });
  });

  describe("combine()", () => {
    it("should return ok when all results are successful", () => {
      const results = [Result.ok(1), Result.ok(2), Result.ok(3)];
      const combined = Result.combine(results);

      expect(combined.isSuccess).toBe(true);
    });

    it("should return first failure when any result fails", () => {
      const results = [Result.ok(1), Result.fail("first error"), Result.fail("second error")];
      const combined = Result.combine(results);

      expect(combined.isFailure).toBe(true);
      expect(combined.getError()).toBe("first error");
    });

    it("should return ok for empty array", () => {
      const combined = Result.combine([]);

      expect(combined.isSuccess).toBe(true);
    });

    it("should return the exact failure result instance", () => {
      const failureResult = Result.fail("error");
      const results = [Result.ok(1), failureResult, Result.ok(2)];
      const combined = Result.combine(results);

      expect(combined).toBe(failureResult);
    });

    it("should handle mixed success and failure results", () => {
      const results = [Result.ok("a"), Result.ok("b"), Result.fail("middle error"), Result.ok("c")];
      const combined = Result.combine(results);

      expect(combined.isFailure).toBe(true);
      expect(combined.getError()).toBe("middle error");
    });

    it("should work with single success result", () => {
      const combined = Result.combine([Result.ok(42)]);

      expect(combined.isSuccess).toBe(true);
    });

    it("should work with single failure result", () => {
      const combined = Result.combine([Result.fail("only error")]);

      expect(combined.isFailure).toBe(true);
      expect(combined.getError()).toBe("only error");
    });
  });

  describe("type hole closure — Result.ok() overloads", () => {
    // Type-level guarantee (enforced by the overloads, not assertable at runtime):
    //   Result.ok()           → Result<void, E>   — void overload, no value required
    //   Result.ok(value)      → Result<T, E>       — typed overload, value required
    //   Result.ok<string>()   → compile error: no overload matches (would have been
    //                           silent before this fix — getValue() returned undefined
    //                           typed as string, a runtime lie)
    //
    // The runtime checks below verify the observable behaviour that the overloads guarantee.

    it("Result.ok() produces a void-payload success (undefined at runtime)", () => {
      const voidResult = Result.ok();

      // Runtime: getValue() returns undefined — correct for void, not a lie about a non-void T
      expect(voidResult.isSuccess).toBe(true);
      expect(voidResult.getValue()).toBeUndefined();
    });

    it("Result.ok(value) round-trips the value through getValue()", () => {
      const strResult = Result.ok("hello");
      const numResult = Result.ok(42);

      // Before the fix: Result.ok<string>() would compile and getValue() here would
      // silently return undefined typed as string. Now the value overload requires an argument.
      expect(strResult.getValue()).toBe("hello");
      expect(numResult.getValue()).toBe(42);
    });

    it("the void and value overloads coexist without narrowing errors", () => {
      // Ensure both paths produce a success result with the expected payload.
      const v: Result<void, string> = Result.ok();
      const s: Result<string, string> = Result.ok("world");

      expect(v.isSuccess).toBe(true);
      expect(s.getValue()).toBe("world");
    });
  });

  describe("type safety", () => {
    it("should preserve value type through ok()", () => {
      const stringResult = Result.ok<string>("hello");
      const numberResult = Result.ok<number>(42);
      const objectResult = Result.ok<{ id: number }>({ id: 1 });

      expect(typeof stringResult.getValue()).toBe("string");
      expect(typeof numberResult.getValue()).toBe("number");
      expect(typeof objectResult.getValue()).toBe("object");
    });

    it("should preserve error type through fail()", () => {
      interface CustomError {
        code: string;
        message: string;
      }
      const result = Result.fail<void, CustomError>({
        code: "E001",
        message: "Error",
      });

      expect(result.getError().code).toBe("E001");
      expect(result.getError().message).toBe("Error");
    });
  });
});
