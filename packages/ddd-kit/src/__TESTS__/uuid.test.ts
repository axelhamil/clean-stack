import { describe, expect, it } from "vitest";
import { UUID } from "../primitives/uuid";
import { StubId } from "./stubs/uuid-stub";

describe("UUID", () => {
  describe("constructor", () => {
    it("should create a UUID with a random value when no value is provided", () => {
      const uuid = new UUID<string>();

      expect(uuid.value).toBeDefined();
      expect(typeof uuid.value).toBe("string");
      expect(uuid.value.length).toBeGreaterThan(0);
    });

    it("should create a UUID with the provided value", () => {
      const testValue = "test-uuid-123";
      const uuid = new UUID<string>(testValue);

      expect(uuid.value).toBe(testValue);
    });
  });

  describe("value getter", () => {
    it("should return the encapsulated value", () => {
      const testValue = "test-value";
      const uuid = new UUID<string>(testValue);

      expect(uuid.value).toBe(testValue);
    });
  });

  describe("copy via constructor", () => {
    it("should create a new UUID from another UUID value", () => {
      const originalUuid = new UUID<string>("original-uuid");
      const newUuid = new UUID<string>(originalUuid.value);

      expect(newUuid).toBeInstanceOf(UUID);
      expect(newUuid.value).toBe(originalUuid.value);
      expect(newUuid).not.toBe(originalUuid);
    });
  });

  describe("equals()", () => {
    it("should return true when comparing equal UUIDs", () => {
      const value = "test-uuid";
      const uuid1 = new UUID<string>(value);
      const uuid2 = new UUID<string>(value);

      expect(uuid1.equals(uuid2)).toBe(true);
    });

    it("should return false when comparing different UUIDs", () => {
      const uuid1 = new UUID<string>("uuid-1");
      const uuid2 = new UUID<string>("uuid-2");

      expect(uuid1.equals(uuid2)).toBe(false);
    });

    it("should return false when comparing with null", () => {
      const uuid = new UUID<string>("test-uuid");

      // biome-ignore lint/suspicious/noExplicitAny: I need to test the equals method with null
      expect(uuid.equals(null as any)).toBe(false);
    });

    it("should return false when comparing with undefined", () => {
      const uuid = new UUID<string>("test-uuid");

      // biome-ignore lint/suspicious/noExplicitAny: I need to test the equals method with undefined
      expect(uuid.equals(undefined as any)).toBe(false);
    });

    it("should return false when subclass compares with base class", () => {
      const uuid = new UUID<string>("test-uuid");
      const stubId = StubId.create(new UUID<string>("test-uuid"));

      // StubId.equals(UUID) should return false because UUID is not instanceof StubId
      // biome-ignore lint/suspicious/noExplicitAny: Testing instanceof check with different UUID types
      expect(stubId.equals(uuid as any)).toBe(false);
    });

    it("should return true when base class compares with subclass", () => {
      const uuid = new UUID<string>("test-uuid");
      const stubId = StubId.create(new UUID<string>("test-uuid"));

      // UUID.equals(StubId) returns true because StubId is instanceof UUID
      // biome-ignore lint/suspicious/noExplicitAny: Testing instanceof check with different UUID types
      expect(uuid.equals(stubId as any)).toBe(true);
    });
  });

  describe("generation", () => {
    it("should generate valid UUID v7 format (time-ordered)", () => {
      const uuid = new UUID<string>();

      expect(uuid.value).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
      );
    });

    it("should generate UUIDs ordered across millisecond boundaries", async () => {
      const a = new UUID<string>().value;
      await new Promise((r) => setTimeout(r, 5));
      const b = new UUID<string>().value;
      await new Promise((r) => setTimeout(r, 5));
      const c = new UUID<string>().value;
      expect(a < b).toBe(true);
      expect(b < c).toBe(true);
    });

    it("should generate unique UUIDs", () => {
      const uuid1 = new UUID<string>();
      const uuid2 = new UUID<string>();

      expect(uuid1.value).not.toBe(uuid2.value);
    });
  });

  describe("from number", () => {
    it("should create UUID from number", () => {
      const uuid = new UUID<number>(123);

      expect(uuid.value).toBe(123);
    });

    it("should support numeric comparison", () => {
      const uuid1 = new UUID<number>(42);
      const uuid2 = new UUID<number>(42);
      const uuid3 = new UUID<number>(99);

      expect(uuid1.equals(uuid2)).toBe(true);
      expect(uuid1.equals(uuid3)).toBe(false);
    });
  });
});

describe("StubId", () => {
  describe("create()", () => {
    it("should create a StubId from a UUID", () => {
      const uuid = new UUID<string>("test-uuid");
      const stubId = StubId.create(uuid);

      expect(stubId).toBeInstanceOf(StubId);
      expect(stubId.value).toBe(uuid.value);
    });

    it("should create a StubId with random value when UUID is not provided", () => {
      const stubId = StubId.create(new UUID<string>());

      expect(stubId).toBeInstanceOf(StubId);
      expect(stubId.value).toBeDefined();
      expect(typeof stubId.value).toBe("string");
    });
  });

  describe("inheritance", () => {
    it("should inherit from UUID", () => {
      const uuid = new UUID<string>("test-uuid");
      const stubId = StubId.create(uuid);

      expect(stubId).toBeInstanceOf(UUID);
    });

    it("should have correct toStringTag", () => {
      const uuid = new UUID<string>("test-uuid");
      const stubId = StubId.create(uuid);

      expect(Object.prototype.toString.call(stubId)).toBe("[object StubId]");
    });
  });
});
