import { beforeEach, describe, expect, it, mock } from "bun:test";
import * as realDrizzle from "@packages/drizzle";
import { mockUnitOfWork } from "@packages/test/bun/unit-of-work";
import type { DeliveredEvent } from "../ports/outbox.port";

// ---------------------------------------------------------------------------
// Query-chain factories, called fresh on each tx.select / tx.insert
// ---------------------------------------------------------------------------
let fakeEndpoints: Array<{ id: string; eventTypes: string[] }> = [];
const capturedInserts: unknown[][] = [];

function makeSelectChain() {
  const proxy: unknown = new Proxy({} as Record<string, unknown>, {
    get(_t, prop) {
      if (prop === "execute") return async () => fakeEndpoints;
      if (prop === "toSQL") return () => ({ sql: "SELECT 1", params: [] });
      return () => proxy;
    },
  });
  return proxy;
}

function makeInsertChain() {
  const proxy: unknown = new Proxy({} as Record<string, unknown>, {
    get(_t, prop) {
      if (prop === "execute") return async () => [];
      if (prop === "toSQL") return () => ({ sql: "INSERT 1", params: [] });
      if (prop === "values")
        return (rows: unknown[]) => {
          capturedInserts.push(rows);
          return proxy;
        };
      return () => proxy;
    },
  });
  return proxy;
}

const fakeTx = {
  select: () => makeSelectChain(),
  insert: () => makeInsertChain(),
  update: () => makeSelectChain(),
  delete: () => makeSelectChain(),
};

// ---------------------------------------------------------------------------
// Drizzle mock: scoped to this file's module registry, invisible to other files.
// ---------------------------------------------------------------------------
mock.module("@packages/drizzle", () => ({ ...realDrizzle, resolveExecutor: () => fakeTx }));

const { WebhookFanoutSubscriber } = await import("../services/webhook-fanout-subscriber");
const { NoOpInstrumentation } = await import("../services/noop-instrumentation");

const instrumentation = new NoOpInstrumentation();
const subscriber = new WebhookFanoutSubscriber(mockUnitOfWork().unitOfWork, instrumentation);

function makeEvent(eventType: string, organizationId = "org-1"): DeliveredEvent {
  return {
    eventId: "event-1",
    eventType,
    aggregateId: "agg-1",
    aggregateType: "test",
    organizationId,
    payload: {},
    dateOccurred: new Date(),
  };
}

describe("WebhookFanoutSubscriber", () => {
  beforeEach(() => {
    fakeEndpoints = [];
    capturedInserts.length = 0;
  });

  it("webhook-fanout creates one delivery per matching endpoint keyed by eventId:endpointId", async () => {
    fakeEndpoints = [
      { id: "ep-1", eventTypes: ["user.*"] },
      { id: "ep-2", eventTypes: ["user.created"] },
      { id: "ep-3", eventTypes: ["org.*"] },
    ];

    await subscriber.handle(makeEvent("user.created"));

    expect(capturedInserts).toHaveLength(1);
    expect(capturedInserts[0]).toMatchObject([
      { endpointId: "ep-1", outboxEventId: "event-1", idempotencyKey: "event-1:ep-1" },
      { endpointId: "ep-2", outboxEventId: "event-1", idempotencyKey: "event-1:ep-2" },
    ]);
  });

  it("skips internal webhook.test events even if endpoint subscribes to '*'", async () => {
    fakeEndpoints = [{ id: "ep-2", eventTypes: ["*"] }];
    await subscriber.handle(makeEvent("webhook.test"));
    expect(capturedInserts.length).toBe(0);
  });

  it("does not deliver when endpoint event type does not match (org.created vs user.created)", async () => {
    fakeEndpoints = [{ id: "ep-3", eventTypes: ["org.created"] }];
    await subscriber.handle(makeEvent("user.created"));
    expect(capturedInserts.length).toBe(0);
  });
});
