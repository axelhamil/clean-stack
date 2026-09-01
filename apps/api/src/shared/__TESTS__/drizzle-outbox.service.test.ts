import { beforeEach, describe, expect, it, mock, spyOn } from "bun:test";
import { Option } from "@packages/ddd-kit";
import * as realEvents from "@packages/events";
import { EventTypes } from "@packages/events";

// ── Mock @packages/drizzle ─────────────────────────────────────────────────
const insertExecute = mock(async () => {});
const selectExecute = mock(async () => [] as unknown[]);
const updateExecute = mock(async () => {});

function makeQueryChain(executeMock: ReturnType<typeof mock>) {
  const chain: Record<string, unknown> = {};
  const leaf = {
    execute: executeMock,
    toSQL: () => ({ sql: "SELECT 1" }),
  };
  // Covers: insert().values() / update().set().where() / select().from().where()...limit()...for()
  const proxy: unknown = new Proxy(leaf, {
    get(target, prop) {
      if (prop === "execute" || prop === "toSQL") return Reflect.get(target, prop);
      return () => proxy;
    },
  });
  chain.proxy = proxy;
  return proxy;
}

const fakeDb = {
  insert: () => makeQueryChain(insertExecute),
  update: () => makeQueryChain(updateExecute),
  select: () => makeQueryChain(selectExecute),
};

const fakeTx = {
  insert: () => makeQueryChain(insertExecute),
  update: () => makeQueryChain(updateExecute),
  select: () => makeQueryChain(selectExecute),
};

mock.module("@packages/drizzle", () => ({
  db: fakeDb,
  eq: () => ({}),
  and: (..._args: unknown[]) => ({}),
  or: (..._args: unknown[]) => ({}),
  isNull: () => ({}),
  isNotNull: () => ({}),
  lt: () => ({}),
  lte: () => ({}),
  gt: () => ({}),
  gte: () => ({}),
  not: () => ({}),
  asc: () => ({}),
  desc: () => ({}),
  like: () => ({}),
  inArray: () => ({}),
  count: () => ({}),
  arrayContains: () => ({}),
  sql: Object.assign((_strings: TemplateStringsArray, ..._values: unknown[]) => ({}), {
    raw: () => ({}),
    identifier: () => ({}),
  }),
  outboxSchema: {
    outboxEvent: {
      id: {},
      eventType: {},
      dispatchedAt: {},
      nextAttemptAt: {},
      occurredAt: {},
      attempts: {},
    },
  },
  auditLogSchema: {
    auditLog: {
      actorId: {},
      actorType: {},
      organizationId: {},
      action: {},
      targetType: {},
      targetId: {},
      occurredAt: {},
      retention: {},
      id: {},
    },
  },
  webhooksSchema: { webhookDelivery: {} },
  multiTenantSchema: { organization: { id: {} } },
  authSchema: {},
  schema: {},
  trackEventsOnSuccess: () => {},
  TransactionService: class {},
  rateLimitSchema: { rateLimitRecord: { key: {}, points: {}, expire: {} } },
  billingSchema: {},
  quotaUsageSchema: {
    quotaUsage: { organizationId: {}, resource: {}, periodStart: {}, used: {}, updatedAt: {} },
  },
  policiesSchema: {},
  consentSchema: {},
  notificationSchema: {
    notification: {
      id: { name: "id" },
      userId: { name: "user_id" },
      organizationId: { name: "organization_id" },
      category: { name: "category" },
      eventType: { name: "event_type" },
      groupKey: { name: "group_key" },
      dedupKey: { name: "dedup_key" },
      payload: { name: "payload" },
      readAt: { name: "read_at" },
      emailPendingAt: { name: "email_pending_at" },
      emailSentAt: { name: "email_sent_at" },
      createdAt: { name: "created_at" },
    },
    notificationPreference: {
      id: { name: "id" },
      scope: { name: "scope" },
      scopeId: { name: "scope_id" },
      category: { name: "category" },
      channel: { name: "channel" },
      enabled: { name: "enabled" },
      frequency: { name: "frequency" },
      locked: { name: "locked" },
    },
  },
  apiTokenSchema: {
    apiToken: {
      id: {},
      userId: {},
      organizationId: {},
      name: {},
      scopes: {},
      tokenHmac: {},
      pepperVersion: {},
      tokenStart: {},
      lastUsedAt: {},
      expiresAt: {},
      revokedAt: {},
      revokedReason: {},
      createdAt: {},
      updatedAt: {},
    },
  },
}));

// ── Mock @packages/events ──────────────────────────────────────────────────
// The subject under test is the outbox writer, not payload validation, so every
// payload schema is stubbed to always accept. Everything else is spread from the
// real module and the stub map is derived from the real catalog — a hand-kept copy
// would silently stop covering every event type added after it was written.
const EventTypesMock = EventTypes;
const stubPayload = { safeParse: () => ({ success: true as const, data: {} as never }) };
mock.module("@packages/events", () => ({
  ...realEvents,
  EventTypes: EventTypesMock,
  ALL_EVENT_TYPES: Object.values(EventTypesMock),
  isKnownEventType: (v: string) => Object.values(EventTypesMock).includes(v as never),
  RETENTION_MAP: Object.fromEntries(Object.values(EventTypesMock).map((t) => [t, "compliance"])),
  retentionFor: () => "compliance",
  PayloadByEventType: Object.fromEntries(
    Object.values(EventTypesMock).map((t) => [t, stubPayload]),
  ),
}));

// ── Imports after mocks ────────────────────────────────────────────────────
const { DrizzleOutboxRepository } = await import("../services/drizzle-outbox.service");
const { NoOpInstrumentation } = await import("../services/noop-instrumentation");

// ── Helpers ────────────────────────────────────────────────────────────────
function makeEvent(
  overrides: Partial<{
    eventType: string;
    aggregateId: string;
    payload: unknown;
  }> = {},
) {
  return {
    eventType: overrides.eventType ?? "user.created",
    aggregateId: overrides.aggregateId ?? "agg-1",
    payload: overrides.payload ?? { userId: "u1", email: "u@test.com", name: "U" },
    dateOccurred: new Date(),
  };
}

const defaultScope = { source: "api", organizationId: "org-1", aggregateType: "User" };

// ── Tests ──────────────────────────────────────────────────────────────────
describe("DrizzleOutboxRepository", () => {
  beforeEach(() => {
    insertExecute.mockReset();
    insertExecute.mockResolvedValue(undefined);
    selectExecute.mockReset();
    selectExecute.mockResolvedValue([]);
    updateExecute.mockReset();
    updateExecute.mockResolvedValue(undefined);
  });

  describe("enqueue", () => {
    it("calls outer startSpan with name 'DrizzleOutboxRepository > enqueue'", async () => {
      const instr = new NoOpInstrumentation();
      const spy = spyOn(instr, "startSpan").mockImplementation(((_opts, cb) =>
        (cb as () => unknown)()) as typeof instr.startSpan);
      const repo = new DrizzleOutboxRepository(instr);
      await repo.enqueue([makeEvent()], defaultScope);
      expect(spy).toHaveBeenCalledWith(
        expect.objectContaining({ name: "DrizzleOutboxRepository > enqueue" }),
        expect.any(Function),
      );
    });

    it("calls inner startSpan with op: 'db.query'", async () => {
      const instr = new NoOpInstrumentation();
      const spy = spyOn(instr, "startSpan").mockImplementation(((_opts, cb) =>
        (cb as () => unknown)()) as typeof instr.startSpan);
      const repo = new DrizzleOutboxRepository(instr);
      await repo.enqueue([makeEvent()], defaultScope);
      const innerCall = spy.mock.calls.find((c) => c[0]?.op === "db.query");
      expect(innerCall).toBeDefined();
    });

    it("no-ops when events array is empty", async () => {
      const repo = new DrizzleOutboxRepository(new NoOpInstrumentation());
      await expect(repo.enqueue([], defaultScope)).resolves.toBeUndefined();
      expect(insertExecute).not.toHaveBeenCalled();
    });

    it("calls instrumentation.capture and rethrows on DB error", async () => {
      const instr = new NoOpInstrumentation();
      const captureSpy = spyOn(instr, "capture");
      // make the inner span throw by patching startSpan to execute the callback but
      // having insertExecute throw on second call (inner span callback)
      let callCount = 0;
      spyOn(instr, "startSpan").mockImplementation(((_opts, cb) => {
        callCount++;
        if (callCount === 2) {
          throw new Error("db fail");
        }
        return (cb as () => unknown)();
      }) as typeof instr.startSpan);
      const repo = new DrizzleOutboxRepository(instr);
      await expect(repo.enqueue([makeEvent()], defaultScope)).rejects.toThrow("db fail");
      expect(captureSpy).toHaveBeenCalled();
    });
  });

  describe("findPendingBatch", () => {
    it("calls outer startSpan with name 'DrizzleOutboxRepository > findPendingBatch'", async () => {
      const instr = new NoOpInstrumentation();
      const spy = spyOn(instr, "startSpan").mockImplementation(((_opts, cb) =>
        (cb as () => unknown)()) as typeof instr.startSpan);
      const repo = new DrizzleOutboxRepository(instr);
      await repo.findPendingBatch(10, fakeTx as never);
      expect(spy).toHaveBeenCalledWith(
        expect.objectContaining({ name: "DrizzleOutboxRepository > findPendingBatch" }),
        expect.any(Function),
      );
    });

    it("returns rows from the DB query with organizationId wrapped as Option", async () => {
      const row = {
        id: "ev-1",
        eventType: "user.created",
        aggregateId: "a",
        aggregateType: "User",
        organizationId: null,
        payload: {},
        metadata: {},
        occurredAt: new Date(),
        attempts: 0,
      };
      selectExecute.mockResolvedValueOnce([row]);
      const repo = new DrizzleOutboxRepository(new NoOpInstrumentation());
      const result = await repo.findPendingBatch(10, fakeTx as never);
      expect(result).toHaveLength(1);
      expect(result[0]?.organizationId.isNone()).toBe(true);
    });

    it("calls instrumentation.capture and rethrows on DB error", async () => {
      const instr = new NoOpInstrumentation();
      const captureSpy = spyOn(instr, "capture");
      let callCount = 0;
      spyOn(instr, "startSpan").mockImplementation(((_opts, cb) => {
        callCount++;
        if (callCount === 2) throw new Error("db fail");
        return (cb as () => unknown)();
      }) as typeof instr.startSpan);
      const repo = new DrizzleOutboxRepository(instr);
      await expect(repo.findPendingBatch(10, fakeTx as never)).rejects.toThrow("db fail");
      expect(captureSpy).toHaveBeenCalled();
    });
  });

  describe("markDispatched", () => {
    it("calls outer startSpan with name 'DrizzleOutboxRepository > markDispatched'", async () => {
      const instr = new NoOpInstrumentation();
      const spy = spyOn(instr, "startSpan").mockImplementation(((_opts, cb) =>
        (cb as () => unknown)()) as typeof instr.startSpan);
      const repo = new DrizzleOutboxRepository(instr);
      await repo.markDispatched("ev-1", fakeTx as never);
      expect(spy).toHaveBeenCalledWith(
        expect.objectContaining({ name: "DrizzleOutboxRepository > markDispatched" }),
        expect.any(Function),
      );
    });

    it("calls inner startSpan with op: 'db.query'", async () => {
      const instr = new NoOpInstrumentation();
      const spy = spyOn(instr, "startSpan").mockImplementation(((_opts, cb) =>
        (cb as () => unknown)()) as typeof instr.startSpan);
      const repo = new DrizzleOutboxRepository(instr);
      await repo.markDispatched("ev-1", fakeTx as never);
      const innerCall = spy.mock.calls.find((c) => c[0]?.op === "db.query");
      expect(innerCall).toBeDefined();
    });

    it("calls instrumentation.capture and rethrows on DB error", async () => {
      const instr = new NoOpInstrumentation();
      const captureSpy = spyOn(instr, "capture");
      let callCount = 0;
      spyOn(instr, "startSpan").mockImplementation(((_opts, cb) => {
        callCount++;
        if (callCount === 2) throw new Error("db fail");
        return (cb as () => unknown)();
      }) as typeof instr.startSpan);
      const repo = new DrizzleOutboxRepository(instr);
      await expect(repo.markDispatched("ev-1", fakeTx as never)).rejects.toThrow("db fail");
      expect(captureSpy).toHaveBeenCalled();
    });
  });

  describe("markFailed", () => {
    it("calls outer startSpan with name 'DrizzleOutboxRepository > markFailed'", async () => {
      const instr = new NoOpInstrumentation();
      const spy = spyOn(instr, "startSpan").mockImplementation(((_opts, cb) =>
        (cb as () => unknown)()) as typeof instr.startSpan);
      const repo = new DrizzleOutboxRepository(instr);
      await repo.markFailed("ev-1", "some error", Option.none(), fakeTx as never);
      expect(spy).toHaveBeenCalledWith(
        expect.objectContaining({ name: "DrizzleOutboxRepository > markFailed" }),
        expect.any(Function),
      );
    });

    it("calls inner startSpan with op: 'db.query'", async () => {
      const instr = new NoOpInstrumentation();
      const spy = spyOn(instr, "startSpan").mockImplementation(((_opts, cb) =>
        (cb as () => unknown)()) as typeof instr.startSpan);
      const repo = new DrizzleOutboxRepository(instr);
      await repo.markFailed("ev-1", "boom", Option.some(new Date()), fakeTx as never);
      const innerCall = spy.mock.calls.find((c) => c[0]?.op === "db.query");
      expect(innerCall).toBeDefined();
    });

    it("calls instrumentation.capture and rethrows on DB error", async () => {
      const instr = new NoOpInstrumentation();
      const captureSpy = spyOn(instr, "capture");
      let callCount = 0;
      spyOn(instr, "startSpan").mockImplementation(((_opts, cb) => {
        callCount++;
        if (callCount === 2) throw new Error("db fail");
        return (cb as () => unknown)();
      }) as typeof instr.startSpan);
      const repo = new DrizzleOutboxRepository(instr);
      await expect(repo.markFailed("ev-1", "err", Option.none(), fakeTx as never)).rejects.toThrow(
        "db fail",
      );
      expect(captureSpy).toHaveBeenCalled();
    });
  });
});
