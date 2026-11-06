import { describe, expect, it, vi } from "vitest";
import { match, Option, Result } from "../index";

describe("Option", () => {
  it("reads null and undefined as none, and keeps falsy values as some", () => {
    expect(Option.fromNullable(null).isNone()).toBe(true);
    expect(Option.fromNullable(undefined).isNone()).toBe(true);
    expect(Option.fromNullable(0).unwrap()).toBe(0);
    expect(Option.fromNullable("").unwrap()).toBe("");
    expect(Option.fromNullable(false).unwrap()).toBe(false);
  });

  it("refuses to unwrap a none", () => {
    expect(() => Option.none<number>().unwrap()).toThrow();
  });

  it("falls back to the default only when the value is absent", () => {
    expect(Option.some(3).unwrapOr(7)).toBe(3);
    expect(Option.none<number>().unwrapOr(7)).toBe(7);
  });

  it("goes back to null at the storage edge", () => {
    expect(Option.some("clip").toNull()).toBe("clip");
    expect(Option.none<string>().toNull()).toBeNull();
  });

  it("transforms a present value and never calls the transform on a none", () => {
    const double = vi.fn((value: number) => value * 2);
    const half = vi.fn((value: number) =>
      value % 2 === 0 ? Option.some(value / 2) : Option.none<number>(),
    );

    expect(Option.some(4).map(double).unwrap()).toBe(8);
    expect(Option.some(4).flatMap(half).unwrap()).toBe(2);
    expect(Option.some(3).flatMap(half).isNone()).toBe(true);
    double.mockClear();
    half.mockClear();
    expect(Option.none<number>().map(double).isNone()).toBe(true);
    expect(Option.none<number>().flatMap(half).isNone()).toBe(true);
    expect(double).not.toHaveBeenCalled();
    expect(half).not.toHaveBeenCalled();
  });

  it("matches each case to its own branch", () => {
    const describeOption = (option: Option<number>) =>
      match(option, { Some: (value) => `some ${value}`, None: () => "none" });

    expect(describeOption(Option.some(0))).toBe("some 0");
    expect(describeOption(Option.none())).toBe("none");
  });

  it("becomes a result that fails with the given error when the value is absent", () => {
    const notFound = vi.fn(() => ({ code: "CLIP_NOT_FOUND" }));

    expect(Option.some("clip").toResult(notFound).getValue()).toBe("clip");
    expect(notFound).not.toHaveBeenCalled();
    expect(Option.none<string>().toResult(notFound).getError()).toEqual({ code: "CLIP_NOT_FOUND" });
    expect(Option.none<string>().toResult("missing").getError()).toBe("missing");
  });

  it("reads a nullable stored value through a creation that can fail", () => {
    const positive = (value: number) =>
      value > 0 ? Result.ok<number>(value) : Result.fail<number>("must be positive");

    expect(Option.fromNullable<number>(null).tryMap(positive).getValue().isNone()).toBe(true);
    expect(Option.fromNullable(3).tryMap(positive).getValue().unwrap()).toBe(3);
    expect(Option.fromNullable(-3).tryMap(positive).getError()).toBe("must be positive");
  });

  it("is equal when both are none or both hold the same value", () => {
    expect(Option.none<number>().equals(Option.none())).toBe(true);
    expect(Option.some(1).equals(Option.some(1))).toBe(true);
    expect(Option.some(1).equals(Option.none())).toBe(false);
    expect(Option.none<number>().equals(Option.some(1))).toBe(false);
  });

  it("compares the held values with the given rule instead of by reference", () => {
    const byId = (left: { id: string }, right: { id: string }) => left.id === right.id;

    expect(Option.some({ id: "a" }).equals(Option.some({ id: "a" }))).toBe(false);
    expect(Option.some({ id: "a" }).equals(Option.some({ id: "a" }), byId)).toBe(true);
    expect(Option.some({ id: "a" }).equals(Option.some({ id: "b" }), byId)).toBe(false);
  });
});
