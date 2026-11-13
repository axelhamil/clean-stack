import { describe, expect, it } from "vitest";
import { Result, ValueObject } from "../index";

class Email extends ValueObject<string> {
  protected validate(value: string): Result<string> {
    if (!value.includes("@")) return Result.fail("Invalid email format");

    return Result.ok(value.toLowerCase());
  }
}

interface FramingValue {
  layout: string;
  crop: { x: number; y: number };
  tags: string[];
}

class Framing extends ValueObject<FramingValue> {
  protected validate(value: FramingValue): Result<FramingValue> {
    return Result.ok(value);
  }
}

class Link extends ValueObject<{ site: URL }> {
  protected validate(value: { site: URL }): Result<{ site: URL }> {
    return Result.ok(value);
  }
}

type SlugError = { code: "SLUG_INVALID"; message: string };

class Slug extends ValueObject<string, SlugError> {
  protected validate(value: string): Result<string, SlugError> {
    if (!/^[a-z0-9-]+$/.test(value)) {
      return Result.fail({ code: "SLUG_INVALID", message: "Only lowercase letters and dashes" });
    }

    return Result.ok(value);
  }
}

describe("ValueObject", () => {
  it("refuses a value its validation rejects, with the validation error", () => {
    const result = Email.create("not-an-email");

    expect(result.isFailure).toBe(true);
    expect(result.getError()).toBe("Invalid email format");
  });

  it("holds the value its validation returns, not the raw input", () => {
    const result = Email.create("OWNER@Example.COM");

    expect(result.getValue()).toBeInstanceOf(Email);
    expect(result.getValue().value).toBe("owner@example.com");
  });

  it("keeps the typed error of its validation", () => {
    const refused: Result<Slug, SlugError> = Slug.create("Not A Slug");
    // @ts-expect-error: the error of a typed value object is its code, not a string
    const untyped: Result<Slug, string> = Slug.create("clutch");

    expect(refused.getError().code).toBe("SLUG_INVALID");
    expect(untyped.isSuccess).toBe(true);
  });

  it("freezes the value it holds", () => {
    const framing = Framing.create({ layout: "split", crop: { x: 0, y: 0 }, tags: [] }).getValue();

    expect(Object.isFrozen(framing.value)).toBe(true);
    expect(() => {
      framing.value.layout = "full";
    }).toThrow();
  });

  it("is equal by value, whatever the order of the keys at any depth", () => {
    const left = Framing.create({ layout: "split", crop: { x: 1, y: 2 }, tags: ["a", "b"] });
    const right = Framing.create({ tags: ["a", "b"], crop: { y: 2, x: 1 }, layout: "split" });

    expect(left.getValue().equals(right.getValue())).toBe(true);
  });

  it("is different when a field or the order of a list differs", () => {
    const framing = Framing.create({ layout: "split", crop: { x: 1, y: 2 }, tags: ["a", "b"] });
    const otherCrop = Framing.create({ layout: "split", crop: { x: 1, y: 3 }, tags: ["a", "b"] });
    const otherOrder = Framing.create({ layout: "split", crop: { x: 1, y: 2 }, tags: ["b", "a"] });

    expect(framing.getValue().equals(otherCrop.getValue())).toBe(false);
    expect(framing.getValue().equals(otherOrder.getValue())).toBe(false);
  });

  it("compares a nested value with internal slots through its json form", () => {
    const link = Link.create({ site: new URL("https://a.test") }).getValue();
    const same = Link.create({ site: new URL("https://a.test") }).getValue();
    const other = Link.create({ site: new URL("https://b.test") }).getValue();

    expect(link.equals(same)).toBe(true);
    expect(link.equals(other)).toBe(false);
  });
});
