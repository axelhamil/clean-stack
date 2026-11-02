import { describe, expect, expectTypeOf, it, vi } from "vitest";
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

  describe("ok() overloads", () => {
    it("types a call without argument as a void payload", () => {
      const voidResult: Result<void, string> = Result.ok();

      expect(voidResult.isSuccess).toBe(true);
      expect(voidResult.getValue()).toBeUndefined();
    });

    it("never types a call without argument as a non-void payload", () => {
      // @ts-expect-error: without a value the only overload is Result<void, E>, so getValue() cannot lie about its type
      const missingValue: Result<string, string> = Result.ok<string>();

      expect(missingValue.getValue()).toBeUndefined();
    });

    it("round-trips a value through getValue()", () => {
      expect(Result.ok("hello").getValue()).toBe("hello");
      expect(Result.ok(42).getValue()).toBe(42);
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

describe("Result combinators", () => {
  it("map applies f on success and leaves a failure untouched", () => {
    const spy = vi.fn((x: number) => x * 2);

    const doubled = Result.ok(2).map((x) => x * 2);
    const failed = Result.fail<number>("e").map(spy);

    expect(doubled.getValue()).toBe(4);
    expect(spy).not.toHaveBeenCalled();
    expect(failed.getError()).toBe("e");
  });

  it("flatMap chains and widens the error union", () => {
    const chained = Result.ok<number, "a">(1).flatMap(() => Result.fail<string, "x">("x"));

    expectTypeOf(chained).toEqualTypeOf<Result<string, "a" | "x">>();
    expect(chained.getError()).toBe("x");
    expect(
      Result.ok(1)
        .flatMap((x) => Result.ok(x + 1))
        .getValue(),
    ).toBe(2);
  });

  it("mapError rewrites only the failure", () => {
    const rewritten = Result.fail<number>("e").mapError((e) => ({ code: e }));
    const untouched = Result.ok<number>(3).mapError((e) => ({ code: e }));

    expect(rewritten.getError()).toEqual({ code: "e" });
    expect(untouched.getValue()).toBe(3);
  });

  it("match calls the branch of the state", () => {
    const patterns = { ok: (v: number) => `ok:${v}`, fail: (e: string) => `fail:${e}` };

    expect(Result.ok(1).match(patterns)).toBe("ok:1");
    expect(Result.fail<number>("boom").match(patterns)).toBe("fail:boom");
  });

  it("unwrapOr returns default on failure, value on success", () => {
    expect(Result.fail<number>("e").unwrapOr(7)).toBe(7);
    expect(Result.ok(1).unwrapOr(7)).toBe(1);
  });

  it("all returns the typed tuple of values when all succeed", () => {
    const all = Result.all([Result.ok(1), Result.ok("a")] as const);

    expectTypeOf(all.getValue()).toEqualTypeOf<[number, string]>();
    expect(all.getValue()).toEqual([1, "a"]);
  });

  it("all returns the first failure in order", () => {
    const all = Result.all([Result.ok(1), Result.fail("first"), Result.fail("second")] as const);

    expect(all.getError()).toBe("first");
  });

  it("combine returns the first failure error and ok void otherwise", () => {
    const failed = Result.combine([Result.ok(1), Result.fail("first"), Result.fail("second")]);
    const passed = Result.combine([Result.ok(1), Result.ok("a")]);

    expectTypeOf(passed).toEqualTypeOf<Result<void, string>>();
    expect(failed.getError()).toBe("first");
    expect(passed.isSuccess).toBe(true);
  });
});
