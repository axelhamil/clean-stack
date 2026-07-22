import { beforeEach, describe, expect, it, mock } from "bun:test";

// ---------------------------------------------------------------------------
// Query-chain factories — called fresh on each tx.select / tx.insert
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
// Drizzle mock — full superset so parallel test files don't see missing exports
// (see shared/CLAUDE.md anti-pattern note)
// ---------------------------------------------------------------------------
mock.module("@packages/drizzle", () => ({
  db: fakeTx,
  eq: () => ({}),
  and: (..._args: unknown[]) => ({}),
  or: (..._args: unknown[]) => ({}),
  isNotNull: () => ({}),
  isNull: () => ({}),
  lt: () => ({}),
  lte: () => ({}),
  gt: () => ({}),
  gte: () => ({}),
  not: () => ({}),
  asc: () => ({}),
  desc: () => ({}),
  inArray: () => ({}),
  like: () => ({}),
  ilike: () => ({}),
  ne: () => ({}),
  between: () => ({}),
  notInArray: () => ({}),
  notExists: () => ({}),
  exists: () => ({}),
  count: () => ({}),
  sum: () => ({}),
  min: () => ({}),
  max: () => ({}),
  avg: () => ({}),
  arrayContains: () => ({}),
  getTableColumns: () => ({}),
  alias: () => ({}),
  sql: Object.assign((_strings: TemplateStringsArray, ..._values: unknown[]) => ({}), {
    raw: () => ({}),
  }),
  schema: {},
  authSchema: {},
  multiTenantSchema: {},
  outboxSchema: { outboxEvent: {} },
  auditLogSchema: { auditLog: {} },
  rateLimitSchema: { rateLimitRecord: { key: {}, points: {}, expire: {} } },
  billingSchema: {},
  quotaUsageSchema: {
    quotaUsage: { organizationId: {}, resource: {}, periodStart: {}, used: {}, updatedAt: {} },
  },
  policiesSchema: {},
  consentSchema: {},
  webhooksSchema: {
    webhookEndpoint: {
      id: "id",
      eventTypes: "event_types",
      organizationId: "organization_id",
      enabled: "enabled",
    },
    webhookDelivery: {
      id: {},
      endpointId: {},
      outboxEventId: {},
      eventType: {},
      payload: {},
      status: {},
      attempts: {},
      nextAttemptAt: {},
      lastError: {},
      lastResponseStatus: {},
      idempotencyKey: {},
      createdAt: {},
    },
  },
  trackEventsOnSuccess: () => {},
  TransactionService: class {},
  uuidv7: () => "generated-uuid",
}));

const { WebhookFanoutSubscriber } = await import("../services/webhook-fanout-subscriber");
const { NoOpInstrumentation } = await import("../services/noop-instrumentation");

const instrumentation = new NoOpInstrumentation();
const subscriber = new WebhookFanoutSubscriber(instrumentation);

function makeEvent(eventType: string, organizationId = "org-1") {
  return {
    id: "event-1",
    eventType,
    aggregateId: "agg-1",
    aggregateType: "test",
    organizationId,
    payload: {},
    metadata: {
      specversion: "1.0" as const,
      source: "test",
      datacontenttype: "application/json" as const,
    },
    occurredAt: new Date(),
    attempts: 0,
  };
}

describe("WebhookFanoutSubscriber", () => {
  beforeEach(() => {
    fakeEndpoints = [];
    capturedInserts.length = 0;
  });

  it("delivers to endpoint subscribed to 'user.*' when event is user.created", async () => {
    fakeEndpoints = [{ id: "ep-1", eventTypes: ["user.*"] }];
    // biome-ignore lint/suspicious/noExplicitAny: test-only cast
    await subscriber.handle(makeEvent("user.created"), fakeTx as any);
    expect(capturedInserts.length).toBe(1);
    const rows = capturedInserts[0] as Array<{ endpointId: string }>;
    expect(rows).toHaveLength(1);
    expect(rows[0]?.endpointId).toBe("ep-1");
  });

  it("skips internal webhook.test events even if endpoint subscribes to '*'", async () => {
    fakeEndpoints = [{ id: "ep-2", eventTypes: ["*"] }];
    // biome-ignore lint/suspicious/noExplicitAny: test-only cast
    await subscriber.handle(makeEvent("webhook.test"), fakeTx as any);
    expect(capturedInserts.length).toBe(0);
  });

  it("does not deliver when endpoint event type does not match (org.created vs user.created)", async () => {
    fakeEndpoints = [{ id: "ep-3", eventTypes: ["org.created"] }];
    // biome-ignore lint/suspicious/noExplicitAny: test-only cast
    await subscriber.handle(makeEvent("user.created"), fakeTx as any);
    expect(capturedInserts.length).toBe(0);
  });
});
