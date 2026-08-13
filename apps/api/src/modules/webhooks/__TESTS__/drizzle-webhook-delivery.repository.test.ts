import { beforeEach, describe, expect, it, mock, spyOn } from "bun:test";

// ---------------------------------------------------------------------------
// DB mock state (mutable per test via beforeEach)
// ---------------------------------------------------------------------------

let dbBehavior: () => Promise<unknown[]> = async () => [];

function buildQuery(result: () => Promise<unknown[]>) {
  const q: Record<string, unknown> = {
    toSQL: () => ({ sql: "SELECT 1", params: [] }),
    execute: result,
  };
  for (const m of [
    "returning",
    "set",
    "where",
    "values",
    "from",
    "limit",
    "innerJoin",
    "insert",
    "update",
    "delete",
    "select",
    "for",
    "orderBy",
  ]) {
    q[m] = () => buildQuery(result);
  }
  return q;
}

function makeDbQuery() {
  return buildQuery(async () => dbBehavior());
}

// Mock exposes the FULL surface of @packages/drizzle — superset rule (see shared/CLAUDE.md):
// mock.module leaks across parallel bun processes; partial mocks cause "Export not found" in others.
mock.module("@packages/drizzle", () => ({
  db: {
    select: () => makeDbQuery(),
    insert: () => makeDbQuery(),
    update: () => makeDbQuery(),
    delete: () => makeDbQuery(),
  },
  eq: () => ({}),
  and: (..._args: unknown[]) => ({}),
  or: (..._args: unknown[]) => ({}),
  inArray: () => ({}),
  isNull: () => ({}),
  isNotNull: () => ({}),
  lt: () => ({}),
  lte: () => ({}),
  gt: () => ({}),
  gte: () => ({}),
  asc: () => ({}),
  desc: () => ({}),
  not: () => ({}),
  like: () => ({}),
  count: () => ({}),
  arrayContains: () => ({}),
  sql: Object.assign((_strings: TemplateStringsArray, ..._values: unknown[]) => ({}), {
    raw: () => ({}),
    identifier: () => ({}),
  }),
  outboxSchema: { outboxEvent: {} },
  auditLogSchema: { auditLog: {} },
  webhooksSchema: {
    webhookEndpoint: {
      id: {},
      organizationId: {},
      $inferSelect: {},
      $inferInsert: {},
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
      $inferSelect: {},
      $inferInsert: {},
    },
    webhookDeliveryAttempt: {
      id: {},
      deliveryId: {},
      attemptNumber: {},
      requestHeaders: {},
      requestBody: {},
      responseStatus: {},
      responseHeaders: {},
      responseBody: {},
      durationMs: {},
      error: {},
      createdAt: {},
      $inferSelect: {},
      $inferInsert: {},
    },
  },
  authSchema: {},
  multiTenantSchema: {},
  schema: {},
  TransactionService: class {},
  trackEventsOnSuccess: () => {},
  uuidv7: () => "generated-uuid",
  rateLimitSchema: { rateLimitRecord: { key: {}, points: {}, expire: {} } },
  billingSchema: {},
  quotaUsageSchema: {
    quotaUsage: { organizationId: {}, resource: {}, periodStart: {}, used: {}, updatedAt: {} },
  },
  policiesSchema: {},
  consentSchema: {},
  notificationSchema: { notification: { dedupKey: { name: "dedup_key" } } },
}));

// All imports AFTER mock.module to ensure mocks are in place before module resolution.
const { DrizzleWebhookDeliveryRepository } = await import(
  "../infrastructure/repositories/drizzle-webhook-delivery.repository"
);
const { NoOpInstrumentation } = await import("../../../shared/services/noop-instrumentation");
const { Option } = await import("@packages/ddd-kit");

const fakeDelivery = {
  id: "del-1",
  endpointId: "ep-1",
  outboxEventId: "out-1",
  eventType: "USER_CREATED",
  payload: { foo: "bar" },
  status: "pending" as const,
  attempts: 0,
  nextAttemptAt: null,
  lastError: null,
  lastResponseStatus: null,
  idempotencyKey: "key-1",
  createdAt: new Date("2024-01-01"),
};

// ---------------------------------------------------------------------------
// Fake transaction — same chainable shape as db mock
// ---------------------------------------------------------------------------
function makeTx() {
  return {
    select: () => makeDbQuery(),
    insert: () => makeDbQuery(),
    update: () => makeDbQuery(),
    delete: () => makeDbQuery(),
  } as never;
}

// ---------------------------------------------------------------------------
// Helper: inject DB error via startSpan spy
// Follows the drizzle-audit.service.test.ts pattern — throw on the Nth span call.
// ---------------------------------------------------------------------------
function injectDbError(
  instr: InstanceType<typeof NoOpInstrumentation>,
  boom: Error,
  throwOnCall = 2,
) {
  let callCount = 0;
  spyOn(instr, "startSpan").mockImplementation(((_opts: unknown, cb: unknown) => {
    callCount++;
    if (callCount === throwOnCall) throw boom;
    return (cb as () => Promise<unknown>)();
  }) as typeof instr.startSpan);
}

describe("DrizzleWebhookDeliveryRepository", () => {
  let instrumentation: InstanceType<typeof NoOpInstrumentation>;
  let repo: InstanceType<typeof DrizzleWebhookDeliveryRepository>;

  beforeEach(() => {
    instrumentation = new NoOpInstrumentation();
    repo = new DrizzleWebhookDeliveryRepository(instrumentation);
    dbBehavior = async () => [];
  });

  // -------------------------------------------------------------------------
  // list
  // -------------------------------------------------------------------------

  describe("list", () => {
    it("happy path: returns items and no nextCursor when count ≤ limit", async () => {
      dbBehavior = async () => [{ d: fakeDelivery }, { d: { ...fakeDelivery, id: "del-2" } }];

      const result = await repo.list({
        endpointId: "ep-1",
        organizationId: "org-1",
        limit: 50,
      });

      expect(result.isSuccess).toBe(true);
      const page = result.getValue();
      expect(page.items).toHaveLength(2);
      expect(page.nextCursor.isNone()).toBe(true);
    });

    it("happy path: sets nextCursor when result count exceeds limit (limit+1 rows returned)", async () => {
      // limit=2 → query fetches limit+1=3; hasMore=true → 2 items + cursor
      dbBehavior = async () => [
        { d: { ...fakeDelivery, id: "del-1", createdAt: new Date("2024-01-03") } },
        { d: { ...fakeDelivery, id: "del-2", createdAt: new Date("2024-01-02") } },
        { d: { ...fakeDelivery, id: "del-3", createdAt: new Date("2024-01-01") } },
      ];

      const result = await repo.list({
        endpointId: "ep-1",
        organizationId: "org-1",
        limit: 2,
      });

      expect(result.isSuccess).toBe(true);
      const page = result.getValue();
      expect(page.items).toHaveLength(2);
      expect(page.nextCursor.isSome()).toBe(true);
    });

    it("happy path: outer span name + inner db.query span with postgresql attribute", async () => {
      dbBehavior = async () => [];
      const spy = spyOn(instrumentation, "startSpan");

      await repo.list({ endpointId: "ep-1", organizationId: "org-1" });

      const calls = spy.mock.calls;
      const outer = calls.find((c) => c[0]?.name === "DrizzleWebhookDeliveryRepository > list");
      const inner = calls.find((c) => c[0]?.op === "db.query");
      expect(outer).toBeDefined();
      expect(inner).toBeDefined();
      expect(inner?.[0]?.attributes?.["db.system.name"]).toBe("postgresql");
    });

    it("failure path: DB throws → instrumentation.capture called + Result.fail", async () => {
      const boom = new Error("list boom");
      const captureSpy = spyOn(instrumentation, "capture");
      injectDbError(instrumentation, boom);

      const result = await repo.list({ endpointId: "ep-1", organizationId: "org-1" });

      expect(result.isFailure).toBe(true);
      expect(result.getError().code).toBe("WEBHOOK_PERSISTENCE_PROVIDER_FAILURE");
      expect(captureSpy).toHaveBeenCalledWith(boom);
    });
  });

  // -------------------------------------------------------------------------
  // findById
  // -------------------------------------------------------------------------

  describe("findById", () => {
    it("happy path: returns Option.some when row exists", async () => {
      dbBehavior = async () => [{ d: fakeDelivery }];

      const result = await repo.findById("del-1", "org-1");

      expect(result.isSome()).toBe(true);
      expect(result.unwrap().id).toBe("del-1");
    });

    it("happy path: returns Option.none when no row found", async () => {
      dbBehavior = async () => [];

      const result = await repo.findById("del-99", "org-1");

      expect(result.isNone()).toBe(true);
    });

    it("happy path: outer + inner spans emitted", async () => {
      dbBehavior = async () => [];
      const spy = spyOn(instrumentation, "startSpan");

      await repo.findById("del-1", "org-1");

      const calls = spy.mock.calls;
      const outer = calls.find((c) => c[0]?.name === "DrizzleWebhookDeliveryRepository > findById");
      const inner = calls.find((c) => c[0]?.op === "db.query");
      expect(outer).toBeDefined();
      expect(inner).toBeDefined();
    });
  });

  // -------------------------------------------------------------------------
  // updateStatus
  // -------------------------------------------------------------------------

  describe("updateStatus", () => {
    it("happy path: returns Result.ok(void)", async () => {
      dbBehavior = async () => [];

      const update = {
        status: "success" as const,
        attempts: 1,
        nextAttemptAt: Option.none<Date>(),
        lastError: Option.none<string>(),
        lastResponseStatus: Option.some(200),
      };
      const result = await repo.updateStatus("del-1", update, makeTx());

      expect(result.isSuccess).toBe(true);
    });

    it("happy path: outer span name and inner db.query span with postgresql attribute", async () => {
      dbBehavior = async () => [];
      const spy = spyOn(instrumentation, "startSpan");

      const update = {
        status: "success" as const,
        attempts: 1,
        nextAttemptAt: Option.none<Date>(),
        lastError: Option.none<string>(),
        lastResponseStatus: Option.some(200),
      };
      await repo.updateStatus("del-1", update, makeTx());

      const calls = spy.mock.calls;
      const outer = calls.find(
        (c) => c[0]?.name === "DrizzleWebhookDeliveryRepository > updateStatus",
      );
      const inner = calls.find((c) => c[0]?.op === "db.query");
      expect(outer).toBeDefined();
      expect(inner?.[0]?.attributes?.["db.system.name"]).toBe("postgresql");
    });

    it("failure path: DB throws → capture called + Result.fail", async () => {
      const boom = new Error("update boom");
      const captureSpy = spyOn(instrumentation, "capture");
      injectDbError(instrumentation, boom);

      const update = {
        status: "success" as const,
        attempts: 1,
        nextAttemptAt: Option.none<Date>(),
        lastError: Option.none<string>(),
        lastResponseStatus: Option.some(200),
      };
      const result = await repo.updateStatus("del-1", update, makeTx());

      expect(result.isFailure).toBe(true);
      expect(result.getError().code).toBe("WEBHOOK_PERSISTENCE_PROVIDER_FAILURE");
      expect(captureSpy).toHaveBeenCalledWith(boom);
    });
  });

  // -------------------------------------------------------------------------
  // findPendingBatch
  // -------------------------------------------------------------------------

  describe("findPendingBatch", () => {
    it("happy path: returns rows ready for dispatch", async () => {
      dbBehavior = async () => [fakeDelivery, { ...fakeDelivery, id: "del-2" }];

      const result = await repo.findPendingBatch(10, makeTx());

      expect(result.isSuccess).toBe(true);
      expect(result.getValue()).toHaveLength(2);
    });

    it("happy path: returns empty array when nothing pending", async () => {
      dbBehavior = async () => [];

      const result = await repo.findPendingBatch(10, makeTx());

      expect(result.isSuccess).toBe(true);
      expect(result.getValue()).toEqual([]);
    });

    it("happy path: outer span + inner db.query span with postgresql attribute", async () => {
      dbBehavior = async () => [];
      const spy = spyOn(instrumentation, "startSpan");

      await repo.findPendingBatch(5, makeTx());

      const calls = spy.mock.calls;
      const outer = calls.find(
        (c) => c[0]?.name === "DrizzleWebhookDeliveryRepository > findPendingBatch",
      );
      const inner = calls.find((c) => c[0]?.op === "db.query");
      expect(outer).toBeDefined();
      expect(inner?.[0]?.attributes?.["db.system.name"]).toBe("postgresql");
    });

    it("failure path: DB throws → capture called + Result.fail", async () => {
      const boom = new Error("batch boom");
      const captureSpy = spyOn(instrumentation, "capture");
      injectDbError(instrumentation, boom);

      const result = await repo.findPendingBatch(10, makeTx());

      expect(result.isFailure).toBe(true);
      expect(result.getError().code).toBe("WEBHOOK_PERSISTENCE_PROVIDER_FAILURE");
      expect(captureSpy).toHaveBeenCalledWith(boom);
    });
  });

  // -------------------------------------------------------------------------
  // enqueueReplay
  // -------------------------------------------------------------------------

  describe("enqueueReplay", () => {
    it("happy path: returns Option.none when original delivery not found", async () => {
      dbBehavior = async () => [];

      const result = await repo.enqueueReplay("del-99", "ep-1", "org-1");

      expect(result.isSuccess).toBe(true);
      expect(result.getValue().isNone()).toBe(true);
    });

    it("happy path: outer span emitted with correct name", async () => {
      dbBehavior = async () => [];
      const spy = spyOn(instrumentation, "startSpan");

      await repo.enqueueReplay("del-99", "ep-1", "org-1");

      const calls = spy.mock.calls;
      const outer = calls.find(
        (c) => c[0]?.name === "DrizzleWebhookDeliveryRepository > enqueueReplay",
      );
      expect(outer).toBeDefined();
    });

    it("happy path: inner db.query span emitted (findQuery at minimum)", async () => {
      dbBehavior = async () => [];
      const spy = spyOn(instrumentation, "startSpan");

      await repo.enqueueReplay("del-99", "ep-1", "org-1");

      const calls = spy.mock.calls;
      const innerSpans = calls.filter((c) => c[0]?.op === "db.query");
      expect(innerSpans.length).toBeGreaterThanOrEqual(1);
      expect(innerSpans[0]?.[0]?.attributes?.["db.system.name"]).toBe("postgresql");
    });

    it("failure path: DB throws → capture called + Result.fail", async () => {
      const boom = new Error("replay boom");
      const captureSpy = spyOn(instrumentation, "capture");
      injectDbError(instrumentation, boom);

      const result = await repo.enqueueReplay("del-1", "ep-1", "org-1");

      expect(result.isFailure).toBe(true);
      expect(result.getError().code).toBe("WEBHOOK_PERSISTENCE_PROVIDER_FAILURE");
      expect(captureSpy).toHaveBeenCalledWith(boom);
    });
  });

  // -------------------------------------------------------------------------
  // createAttempt
  // -------------------------------------------------------------------------

  describe("createAttempt", () => {
    const fakeAttemptArgs = {
      deliveryId: "del-1",
      attemptNumber: 1,
      requestHeaders: Option.none<Record<string, string>>(),
      requestBody: Option.none<string>(),
      responseStatus: Option.some(200),
      responseHeaders: Option.none<Record<string, string>>(),
      responseBody: Option.some("ok"),
      durationMs: Option.some(123),
      error: Option.none<string>(),
    };

    it("happy path: returns Result.ok(void)", async () => {
      dbBehavior = async () => [];

      const result = await repo.createAttempt(fakeAttemptArgs, makeTx());

      expect(result.isSuccess).toBe(true);
    });

    it("happy path: outer span name + inner db.query span", async () => {
      dbBehavior = async () => [];
      const spy = spyOn(instrumentation, "startSpan");

      await repo.createAttempt(fakeAttemptArgs, makeTx());

      const calls = spy.mock.calls;
      const outer = calls.find(
        (c) => c[0]?.name === "DrizzleWebhookDeliveryRepository > createAttempt",
      );
      const inner = calls.find((c) => c[0]?.op === "db.query");
      expect(outer).toBeDefined();
      expect(inner?.[0]?.attributes?.["db.system.name"]).toBe("postgresql");
    });

    it("failure path: DB throws → capture called + Result.fail", async () => {
      const boom = new Error("attempt boom");
      const captureSpy = spyOn(instrumentation, "capture");
      injectDbError(instrumentation, boom);

      const result = await repo.createAttempt(fakeAttemptArgs, makeTx());

      expect(result.isFailure).toBe(true);
      expect(result.getError().code).toBe("WEBHOOK_PERSISTENCE_PROVIDER_FAILURE");
      expect(captureSpy).toHaveBeenCalledWith(boom);
    });
  });

  // -------------------------------------------------------------------------
  // findByIdWithAttempts
  // -------------------------------------------------------------------------

  describe("findByIdWithAttempts", () => {
    const fakeAttemptRow = {
      id: "att-1",
      deliveryId: "del-1",
      attemptNumber: 1,
      requestHeaders: null,
      requestBody: null,
      responseStatus: 200,
      responseHeaders: null,
      responseBody: "ok",
      durationMs: 100,
      error: null,
      createdAt: new Date("2024-01-01"),
    };

    it("happy path: returns Option.none when delivery not found", async () => {
      dbBehavior = async () => [];

      const result = await repo.findByIdWithAttempts("del-99", "org-1");

      expect(result.isNone()).toBe(true);
    });

    it("happy path: returns Option.some with attempts array when delivery exists", async () => {
      let callCount = 0;
      dbBehavior = async () => {
        callCount++;
        if (callCount === 1) return [{ d: fakeDelivery }];
        return [fakeAttemptRow];
      };

      const result = await repo.findByIdWithAttempts("del-1", "org-1");

      expect(result.isSome()).toBe(true);
      const record = result.unwrap();
      expect(record.id).toBe("del-1");
      expect(record.attemptHistory).toHaveLength(1);
      expect(record.attemptHistory[0]?.attemptNumber).toBe(1);
    });

    it("happy path: outer span name + inner db.query spans", async () => {
      dbBehavior = async () => [];
      const spy = spyOn(instrumentation, "startSpan");

      await repo.findByIdWithAttempts("del-1", "org-1");

      const calls = spy.mock.calls;
      const outer = calls.find(
        (c) => c[0]?.name === "DrizzleWebhookDeliveryRepository > findByIdWithAttempts",
      );
      const inner = calls.find((c) => c[0]?.op === "db.query");
      expect(outer).toBeDefined();
      expect(inner?.[0]?.attributes?.["db.system.name"]).toBe("postgresql");
    });
  });

  // -------------------------------------------------------------------------
  // enqueueTargeted
  // -------------------------------------------------------------------------

  describe("enqueueTargeted", () => {
    const targetedArgs = {
      endpointId: "ep-1",
      outboxEventId: "out-1",
      eventType: "USER_CREATED",
      payload: { foo: "bar" },
      idempotencyKey: "idem-1",
    };

    it("happy path: returns Result.ok with the inserted delivery", async () => {
      dbBehavior = async () => [fakeDelivery];

      const result = await repo.enqueueTargeted(targetedArgs, makeTx());

      expect(result.isSuccess).toBe(true);
      expect(result.getValue().id).toBe("del-1");
    });

    it("happy path: outer span name + inner db.query span", async () => {
      dbBehavior = async () => [fakeDelivery];
      const spy = spyOn(instrumentation, "startSpan");

      await repo.enqueueTargeted(targetedArgs, makeTx());

      const calls = spy.mock.calls;
      const outer = calls.find(
        (c) => c[0]?.name === "DrizzleWebhookDeliveryRepository > enqueueTargeted",
      );
      const inner = calls.find((c) => c[0]?.op === "db.query");
      expect(outer).toBeDefined();
      expect(inner?.[0]?.attributes?.["db.system.name"]).toBe("postgresql");
    });

    it("failure path: DB throws → capture called + Result.fail", async () => {
      const boom = new Error("targeted boom");
      const captureSpy = spyOn(instrumentation, "capture");
      injectDbError(instrumentation, boom);

      const result = await repo.enqueueTargeted(targetedArgs, makeTx());

      expect(result.isFailure).toBe(true);
      expect(result.getError().code).toBe("WEBHOOK_PERSISTENCE_PROVIDER_FAILURE");
      expect(captureSpy).toHaveBeenCalledWith(boom);
    });
  });
});
