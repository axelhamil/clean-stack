import { describe, expect, it } from "vitest";
import { canonicalize } from "../index";

describe("canonicalize", () => {
  it("sorts keys regardless of insertion order", () => {
    expect(canonicalize({ b: 1, a: 2 })).toBe(canonicalize({ a: 2, b: 1 }));
  });
  it("is stable for nested objects and arrays", () => {
    expect(canonicalize({ x: { d: 1, c: 2 }, y: [3, { f: 4, e: 5 }] })).toBe(
      '{"x":{"c":2,"d":1},"y":[3,{"e":5,"f":4}]}',
    );
  });
  it("handles null and primitives", () => {
    expect(canonicalize(null)).toBe("null");
    expect(canonicalize("a")).toBe('"a"');
  });
});
