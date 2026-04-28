import { describe, expect, it, vi } from "vitest";
import { match, None, Option, Some } from "../primitives/option";

describe("Option", () => {
  describe("Option.some()", () => {
    it("should create Some with value", () => {
      const option = Option.some(42);

      expect(option.isSome()).toBe(true);
      expect(option.isNone()).toBe(false);
      expect(option.unwrap()).toBe(42);
    });

    it("should create Some with complex object", () => {
      const value = { name: "test", count: 5 };
      const option = Option.some(value);

      expect(option.isSome()).toBe(true);
      expect(option.unwrap()).toEqual(value);
    });

    it("should create Some with falsy values (0, empty string, false)", () => {
      const zeroOption = Option.some(0);
      const emptyStringOption = Option.some("");
      const falseOption = Option.some(false);

      expect(zeroOption.isSome()).toBe(true);
      expect(zeroOption.unwrap()).toBe(0);
      expect(emptyStringOption.isSome()).toBe(true);
      expect(emptyStringOption.unwrap()).toBe("");
      expect(falseOption.isSome()).toBe(true);
      expect(falseOption.unwrap()).toBe(false);
    });
  });

  describe("Option.none()", () => {
    it("should create None", () => {
      const option = Option.none<number>();

      expect(option.isNone()).toBe(true);
      expect(option.isSome()).toBe(false);
    });

    it("should create None with type parameter", () => {
      const option = Option.none<string>();

      expect(option.isNone()).toBe(true);
    });
  });

  describe("Option.fromNullable()", () => {
    it("should return Some for non-null value", () => {
      const option = Option.fromNullable(42);

      expect(option.isSome()).toBe(true);
      expect(option.unwrap()).toBe(42);
    });

    it("should return None for null", () => {
      const option = Option.fromNullable(null);

      expect(option.isNone()).toBe(true);
    });

    it("should return None for undefined", () => {
      const option = Option.fromNullable(undefined);

      expect(option.isNone()).toBe(true);
    });

    it("should return Some for falsy non-null values", () => {
      expect(Option.fromNullable(0).isSome()).toBe(true);
      expect(Option.fromNullable("").isSome()).toBe(true);
      expect(Option.fromNullable(false).isSome()).toBe(true);
    });

    it("should return Some for object", () => {
      const obj = { id: 1 };
      const option = Option.fromNullable(obj);

      expect(option.isSome()).toBe(true);
      expect(option.unwrap()).toBe(obj);
    });
  });

  describe("unwrap()", () => {
    it("should return value on Some", () => {
      const option = Option.some("test value");

      expect(option.unwrap()).toBe("test value");
    });

    it("should throw on None", () => {
      const option = Option.none<number>();

      expect(() => option.unwrap()).toThrow("Called unwrap on a None value");
    });
  });

  describe("unwrapOr()", () => {
    it("should return value on Some", () => {
      const option = Option.some(42);

      expect(option.unwrapOr(100)).toBe(42);
    });

    it("should return default on None", () => {
      const option = Option.none<number>();

      expect(option.unwrapOr(100)).toBe(100);
    });
  });

  describe("unwrapOrElse()", () => {
    it("should return value on Some without calling function", () => {
      const option = Option.some(42);
      const fn = vi.fn(() => 100);

      expect(option.unwrapOrElse(fn)).toBe(42);
      expect(fn).not.toHaveBeenCalled();
    });

    it("should call function and return result on None", () => {
      const option = Option.none<number>();
      const fn = vi.fn(() => 100);

      expect(option.unwrapOrElse(fn)).toBe(100);
      expect(fn).toHaveBeenCalledOnce();
    });
  });

  describe("map()", () => {
    it("should transform Some value", () => {
      const option = Option.some(42).map((x) => x * 2);

      expect(option.isSome()).toBe(true);
      expect(option.unwrap()).toBe(84);
    });

    it("should chain multiple maps", () => {
      const option = Option.some(10)
        .map((x) => x + 5)
        .map((x) => x * 2)
        .map((x) => `value: ${x}`);

      expect(option.unwrap()).toBe("value: 30");
    });

    it("should return None when mapping None", () => {
      const option = Option.none<number>().map((x) => x * 2);

      expect(option.isNone()).toBe(true);
    });

    it("should not call mapper function on None", () => {
      const mapper = vi.fn((x: number) => x * 2);
      Option.none<number>().map(mapper);

      expect(mapper).not.toHaveBeenCalled();
    });
  });

  describe("flatMap()", () => {
    it("should flatten nested Option on Some", () => {
      const option = Option.some(42).flatMap((x) => Option.some(x * 2));

      expect(option.isSome()).toBe(true);
      expect(option.unwrap()).toBe(84);
    });

    it("should return None if inner function returns None", () => {
      const option = Option.some(42).flatMap(() => Option.none<number>());

      expect(option.isNone()).toBe(true);
    });

    it("should return None when flatMapping None", () => {
      const option = Option.none<number>().flatMap((x) => Option.some(x * 2));

      expect(option.isNone()).toBe(true);
    });

    it("should chain flatMap operations", () => {
      const safeDivide = (a: number, b: number): Option<number> =>
        b === 0 ? Option.none() : Option.some(a / b);

      const result = Option.some(100)
        .flatMap((x) => safeDivide(x, 2))
        .flatMap((x) => safeDivide(x, 5));

      expect(result.unwrap()).toBe(10);
    });

    it("should short-circuit on None in chain", () => {
      const safeDivide = (a: number, b: number): Option<number> =>
        b === 0 ? Option.none() : Option.some(a / b);

      const result = Option.some(100)
        .flatMap((x) => safeDivide(x, 0))
        .flatMap((x) => safeDivide(x, 5));

      expect(result.isNone()).toBe(true);
    });
  });

  describe("filter()", () => {
    it("should return Some if predicate is true", () => {
      const option = Option.some(42).filter((x) => x > 10);

      expect(option.isSome()).toBe(true);
      expect(option.unwrap()).toBe(42);
    });

    it("should return None if predicate is false", () => {
      const option = Option.some(42).filter((x) => x > 100);

      expect(option.isNone()).toBe(true);
    });

    it("should return None when filtering None", () => {
      const option = Option.none<number>().filter((x) => x > 10);

      expect(option.isNone()).toBe(true);
    });

    it("should not call predicate on None", () => {
      const predicate = vi.fn((x: number) => x > 10);
      Option.none<number>().filter(predicate);

      expect(predicate).not.toHaveBeenCalled();
    });
  });

  describe("or()", () => {
    it("should return self if Some", () => {
      const option = Option.some(42).or(Option.some(100));

      expect(option.unwrap()).toBe(42);
    });

    it("should return other if None", () => {
      const option = Option.none<number>().or(Option.some(100));

      expect(option.unwrap()).toBe(100);
    });

    it("should return None if both are None", () => {
      const option = Option.none<number>().or(Option.none<number>());

      expect(option.isNone()).toBe(true);
    });
  });

  describe("orElse()", () => {
    it("should return self if Some without calling function", () => {
      const fn = vi.fn(() => Option.some(100));
      const option = Option.some(42).orElse(fn);

      expect(option.unwrap()).toBe(42);
      expect(fn).not.toHaveBeenCalled();
    });

    it("should call function and return result if None", () => {
      const fn = vi.fn(() => Option.some(100));
      const option = Option.none<number>().orElse(fn);

      expect(option.unwrap()).toBe(100);
      expect(fn).toHaveBeenCalledOnce();
    });
  });

  describe("xor()", () => {
    it("should return Some if only self is Some", () => {
      const option = Option.some(42).xor(Option.none<number>());

      expect(option.isSome()).toBe(true);
      expect(option.unwrap()).toBe(42);
    });

    it("should return Some if only other is Some", () => {
      const option = Option.none<number>().xor(Option.some(100));

      expect(option.isSome()).toBe(true);
      expect(option.unwrap()).toBe(100);
    });

    it("should return None if both are Some", () => {
      const option = Option.some(42).xor(Option.some(100));

      expect(option.isNone()).toBe(true);
    });

    it("should return None if both are None", () => {
      const option = Option.none<number>().xor(Option.none<number>());

      expect(option.isNone()).toBe(true);
    });
  });

  describe("inspect()", () => {
    it("should call function with value on Some", () => {
      const fn = vi.fn();
      const option = Option.some(42).inspect(fn);

      expect(fn).toHaveBeenCalledWith(42);
      expect(option.unwrap()).toBe(42);
    });

    it("should return self on Some", () => {
      const original = Option.some(42);
      const result = original.inspect(() => {});

      expect(result).toBe(original);
    });

    it("should not call function on None", () => {
      const fn = vi.fn();
      Option.none<number>().inspect(fn);

      expect(fn).not.toHaveBeenCalled();
    });

    it("should return self on None", () => {
      const original = Option.none<number>();
      const result = original.inspect(() => {});

      expect(result).toBe(original);
    });
  });

  describe("toUndefined()", () => {
    it("should return value on Some", () => {
      const option = Option.some(42);

      expect(option.toUndefined()).toBe(42);
    });

    it("should return undefined on None", () => {
      const option = Option.none<number>();

      expect(option.toUndefined()).toBeUndefined();
    });
  });

  describe("toNull()", () => {
    it("should return value on Some", () => {
      const option = Option.some(42);

      expect(option.toNull()).toBe(42);
    });

    it("should return null on None", () => {
      const option = Option.none<number>();

      expect(option.toNull()).toBeNull();
    });
  });

  describe("toString()", () => {
    it("should return Some(value) for Some", () => {
      const option = Option.some(42);

      expect(option.toString()).toBe("Some(42)");
    });

    it("should return None for None", () => {
      const option = Option.none<number>();

      expect(option.toString()).toBe("None");
    });
  });

  describe("match()", () => {
    it("should call Some handler for Some", () => {
      const result = match(Option.some(42), {
        Some: (v) => `value: ${v}`,
        None: () => "empty",
      });

      expect(result).toBe("value: 42");
    });

    it("should call None handler for None", () => {
      const result = match(Option.none<number>(), {
        Some: (v) => `value: ${v}`,
        None: () => "empty",
      });

      expect(result).toBe("empty");
    });

    it("should work with different return types", () => {
      const someResult = match(Option.some(42), {
        Some: (v) => v * 2,
        None: () => 0,
      });

      const noneResult = match(Option.none<number>(), {
        Some: (v) => v * 2,
        None: () => 0,
      });

      expect(someResult).toBe(84);
      expect(noneResult).toBe(0);
    });

    it("should work with complex objects", () => {
      const option = Option.some({ id: 1, name: "test" });

      const result = match(option, {
        Some: (obj) => obj.name.toUpperCase(),
        None: () => "N/A",
      });

      expect(result).toBe("TEST");
    });
  });

  describe("Some class", () => {
    it("should be accessible directly via Some.of()", () => {
      const some = Some.of(42);

      expect(some.isSome()).toBe(true);
      expect(some.unwrap()).toBe(42);
    });
  });

  describe("None class", () => {
    it("should be accessible directly via None.of()", () => {
      const none = None.of<number>();

      expect(none.isNone()).toBe(true);
    });
  });

  describe("type safety", () => {
    it("should preserve value type through operations", () => {
      interface User {
        id: number;
        name: string;
      }

      const user: User = { id: 1, name: "Alice" };
      const option = Option.some(user);

      expect(option.unwrap().id).toBe(1);
      expect(option.unwrap().name).toBe("Alice");
    });

    it("should allow type transformation through map", () => {
      const option = Option.some(42).map((x) => x.toString());

      expect(typeof option.unwrap()).toBe("string");
      expect(option.unwrap()).toBe("42");
    });
  });
});
