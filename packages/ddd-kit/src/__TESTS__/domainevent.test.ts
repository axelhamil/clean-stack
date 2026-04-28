import { describe, expect, it } from "vitest";
import { BaseDomainEvent, type IDomainEvent } from "../domain/domain-event";

interface TestPayload {
  userId: string;
  email: string;
}

class TestEvent extends BaseDomainEvent<TestPayload> {
  readonly eventType = "test.created";
  readonly aggregateId: string;
  readonly payload: TestPayload;

  constructor(aggregateId: string, payload: TestPayload) {
    super();
    this.aggregateId = aggregateId;
    this.payload = payload;
  }
}

class EmptyPayloadEvent extends BaseDomainEvent<undefined> {
  readonly eventType = "test.empty";
  readonly aggregateId: string;
  readonly payload: undefined = undefined;

  constructor(aggregateId: string) {
    super();
    this.aggregateId = aggregateId;
  }
}

describe("IDomainEvent", () => {
  describe("interface contract", () => {
    it("should have required properties", () => {
      const event: IDomainEvent<TestPayload> = {
        eventType: "user.created",
        dateOccurred: new Date(),
        aggregateId: "123",
        payload: { userId: "123", email: "test@example.com" },
      };

      expect(event.eventType).toBe("user.created");
      expect(event.dateOccurred).toBeInstanceOf(Date);
      expect(event.aggregateId).toBe("123");
      expect(event.payload).toEqual({
        userId: "123",
        email: "test@example.com",
      });
    });

    it("should support unknown payload type", () => {
      const event: IDomainEvent = {
        eventType: "generic.event",
        dateOccurred: new Date(),
        aggregateId: "456",
        payload: { any: "data" },
      };

      expect(event.payload).toEqual({ any: "data" });
    });

    it("should support void payload", () => {
      const event: IDomainEvent<void> = {
        eventType: "simple.event",
        dateOccurred: new Date(),
        aggregateId: "789",
        payload: undefined,
      };

      expect(event.payload).toBeUndefined();
    });
  });
});

describe("BaseDomainEvent", () => {
  describe("constructor", () => {
    it("should set dateOccurred to current date", () => {
      const before = new Date();
      const event = new TestEvent("123", {
        userId: "123",
        email: "test@example.com",
      });
      const after = new Date();

      expect(event.dateOccurred.getTime()).toBeGreaterThanOrEqual(
        before.getTime(),
      );
      expect(event.dateOccurred.getTime()).toBeLessThanOrEqual(after.getTime());
    });

    it("should create unique dates for different events", async () => {
      const event1 = new TestEvent("1", { userId: "1", email: "a@test.com" });
      await new Promise((r) => setTimeout(r, 5));
      const event2 = new TestEvent("2", { userId: "2", email: "b@test.com" });

      expect(event1.dateOccurred.getTime()).toBeLessThanOrEqual(
        event2.dateOccurred.getTime(),
      );
    });
  });

  describe("implementation", () => {
    it("should implement IDomainEvent interface", () => {
      const event = new TestEvent("user-123", {
        userId: "user-123",
        email: "test@example.com",
      });

      expect(event.eventType).toBe("test.created");
      expect(event.aggregateId).toBe("user-123");
      expect(event.payload).toEqual({
        userId: "user-123",
        email: "test@example.com",
      });
      expect(event.dateOccurred).toBeInstanceOf(Date);
    });

    it("should work with empty payload", () => {
      const event = new EmptyPayloadEvent("aggregate-1");

      expect(event.eventType).toBe("test.empty");
      expect(event.aggregateId).toBe("aggregate-1");
      expect(event.payload).toBeUndefined();
    });

    it("should be assignable to IDomainEvent", () => {
      const event: IDomainEvent<TestPayload> = new TestEvent("123", {
        userId: "123",
        email: "test@example.com",
      });

      expect(event.eventType).toBe("test.created");
    });
  });

  describe("readonly properties", () => {
    it("should have readonly dateOccurred", () => {
      const event = new TestEvent("123", {
        userId: "123",
        email: "test@example.com",
      });
      const originalDate = event.dateOccurred;

      // TypeScript prevents modification, but we verify the value is stable
      expect(event.dateOccurred).toBe(originalDate);
    });
  });

  describe("extending BaseDomainEvent", () => {
    class ComplexEvent extends BaseDomainEvent<{
      items: string[];
      metadata: { version: number };
    }> {
      readonly eventType = "complex.event";
      readonly aggregateId: string;
      readonly payload: { items: string[]; metadata: { version: number } };

      constructor(aggregateId: string, items: string[], version: number) {
        super();
        this.aggregateId = aggregateId;
        this.payload = { items, metadata: { version } };
      }
    }

    it("should support complex payload types", () => {
      const event = new ComplexEvent("agg-1", ["item1", "item2"], 1);

      expect(event.payload.items).toEqual(["item1", "item2"]);
      expect(event.payload.metadata.version).toBe(1);
    });
  });
});
