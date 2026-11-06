import { describe, expect, it, vi } from "vitest";
import { Result } from "../index";

describe("Result", () => {
  it("carries the value of a success", () => {
    const result = Result.ok({ id: 1 });

    expect(result.isSuccess).toBe(true);
    expect(result.isFailure).toBe(false);
    expect(result.getValue()).toEqual({ id: 1 });
  });

  it("carries the typed error of a failure", () => {
    const result = Result.fail<number, { code: string }>({ code: "CLIP_NOT_FOUND" });

    expect(result.isFailure).toBe(true);
    expect(result.isSuccess).toBe(false);
    expect(result.getError()).toEqual({ code: "CLIP_NOT_FOUND" });
  });

  it("refuses to read the value of a failure and the error of a success", () => {
    expect(() => Result.fail<number>("boom").getValue()).toThrow();
    expect(() => Result.ok(1).getError()).toThrow();
  });

  it("types a call without argument as a void success", () => {
    const done: Result<void, { code: string }> = Result.ok();

    expect(done.isSuccess).toBe(true);
  });

  it("never types a call without argument as a non-void payload", () => {
    // @ts-expect-error: without a value the only overload is Result<void, E>, so getValue() cannot lie about its type
    const missingValue: Result<string, string> = Result.ok<string>();

    expect(missingValue.getValue()).toBeUndefined();
  });

  it("combines to the first failure, or to a success when none failed", () => {
    const failed = Result.combine([Result.ok(1), Result.fail("first"), Result.fail("second")]);
    const passed = Result.combine([Result.ok(1), Result.ok("two")]);

    expect(failed.getError()).toBe("first");
    expect(passed.isSuccess).toBe(true);
    expect(Result.combine([]).isSuccess).toBe(true);
  });

  it("gathers every value in order, or the first failure", () => {
    const title = Result.ok<string, { code: string }>("Clutch");
    const attempts = Result.ok<number, { code: string }>(2);
    const missing = Result.fail<boolean, { code: string }>({ code: "CLIP_NOT_FOUND" });
    const invalid = Result.fail<boolean, { code: string }>({ code: "CLIP_INVALID" });

    const gathered: Result<[string, number], { code: string }> = Result.all([title, attempts]);
    const failed = Result.all([title, missing, invalid]);

    expect(gathered.getValue()).toEqual(["Clutch", 2]);
    expect(failed.getError()).toEqual({ code: "CLIP_NOT_FOUND" });
  });

  it("transforms the value of a success and leaves a failure as it is", () => {
    const double = vi.fn((value: number) => value * 2);
    const halve = vi.fn((value: number) =>
      value % 2 === 0 ? Result.ok<number>(value / 2) : Result.fail<number>("odd"),
    );

    expect(Result.ok<number>(4).map(double).getValue()).toBe(8);
    expect(Result.ok<number>(4).flatMap(halve).getValue()).toBe(2);
    expect(Result.ok<number>(3).flatMap(halve).getError()).toBe("odd");
    double.mockClear();
    halve.mockClear();
    expect(Result.fail<number>("boom").map(double).getError()).toBe("boom");
    expect(Result.fail<number>("boom").flatMap(halve).getError()).toBe("boom");
    expect(double).not.toHaveBeenCalled();
    expect(halve).not.toHaveBeenCalled();
  });

  it("rewraps the error of a failure and leaves a success as it is", () => {
    const typed = (message: string) => ({ code: "CLIP_INVALID", message });

    expect(Result.fail<number>("too long").mapError(typed).getError()).toEqual({
      code: "CLIP_INVALID",
      message: "too long",
    });
    expect(Result.ok<number>(1).mapError(typed).getValue()).toBe(1);
  });

  it("matches each case to its own branch and falls back only on a failure", () => {
    const describeResult = (result: Result<number>) =>
      result.match({ ok: (value) => `ok ${value}`, fail: (error) => `fail ${error}` });

    expect(describeResult(Result.ok(0))).toBe("ok 0");
    expect(describeResult(Result.fail("boom"))).toBe("fail boom");
    expect(Result.ok<number>(0).unwrapOr(7)).toBe(0);
    expect(Result.fail<number>("boom").unwrapOr(7)).toBe(7);
  });
});
