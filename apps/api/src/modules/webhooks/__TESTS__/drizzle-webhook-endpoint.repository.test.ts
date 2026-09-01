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

const fakeRow = {
  id: "ep-1",
  organizationId: "org-1",
  url: "https://example.com/hook",
  secretCipher: "cipher",
  eventTypes: ["USER_CREATED"],
  enabled: true,
  createdAt: new Date("2024-01-01"),
  updatedAt: new Date("2024-01-01"),
  previousSecretCipher: null,
  previousSecretExpiresAt: null,
  consecutiveFailures: 0,
  firstFailedAt: null,
  disabledAt: null,
};

// Only what this file's subject actually touches: test files do not share a module
// registry, so this replacement is invisible to every other file (see shared/CLAUDE.md).
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
      url: {},
      secretCipher: {},
      eventTypes: {},
      enabled: {},
      createdAt: {},
      updatedAt: {},
      previousSecretCipher: {},
      previousSecretExpiresAt: {},
      consecutiveFailures: {},
      firstFailedAt: {},
      disabledAt: {},
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
    },
  },
  authSchema: {},
  multiTenantSchema: { organization: { id: {} } },
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
}));

const { DrizzleWebhookEndpointRepository } = await import(
  "../infrastructure/repositories/drizzle-webhook-endpoint.repository"
);
const { NoOpInstrumentation } = await import("../../../shared/services/noop-instrumentation");

type InstrType = InstanceType<typeof NoOpInstrumentation>;

// Fake transaction — exposes the same query methods as db so tx ?? db resolves uniformly.
const tx = {
  select: () => makeDbQuery(),
  insert: () => makeDbQuery(),
  update: () => makeDbQuery(),
  delete: () => makeDbQuery(),
  // biome-ignore lint/suspicious/noExplicitAny: test stub
} as unknown as any;

describe("DrizzleWebhookEndpointRepository", () => {
  let instrumentation: InstrType;
  let repo: InstanceType<typeof DrizzleWebhookEndpointRepository>;

  beforeEach(() => {
    instrumentation = new NoOpInstrumentation();
    repo = new DrizzleWebhookEndpointRepository(instrumentation);
    dbBehavior = async () => [];
  });

  // -------------------------------------------------------------------------
  // Helper: inject DB error via startSpan spy
  // Follows the drizzle-audit.service.test.ts pattern — throw on the 2nd span call
  // (inner db.query span) to trigger the repo's catch block.
  // -------------------------------------------------------------------------
  function injectDbError(instr: InstrType, boom: Error) {
    let callCount = 0;
    spyOn(instr, "startSpan").mockImplementation(((_opts: unknown, cb: unknown) => {
      callCount++;
      if (callCount === 2) throw boom;
      return (cb as () => Promise<unknown>)();
    }) as typeof instr.startSpan);
  }

  // -------------------------------------------------------------------------
  // create
  // -------------------------------------------------------------------------

  describe("create", () => {
    it("happy path: returns the inserted row as WebhookEndpointRecord", async () => {
      dbBehavior = async () => [fakeRow];

      const result = await repo.create({
        id: "ep-1",
        organizationId: "org-1",
        url: "https://example.com/hook",
        secretCipher: "cipher",
        eventTypes: ["USER_CREATED"],
        enabled: true,
      });

      expect(result.isSuccess).toBe(true);
      expect(result.getValue().id).toBe("ep-1");
      expect(result.getValue().url).toBe("https://example.com/hook");
    });

    it("happy path: outer span name and inner db.query span emitted", async () => {
      dbBehavior = async () => [fakeRow];
      const spy = spyOn(instrumentation, "startSpan");

      await repo.create({
        id: "ep-1",
        organizationId: "org-1",
        url: "https://example.com/hook",
        secretCipher: "cipher",
        eventTypes: [],
        enabled: true,
      });

      const calls = spy.mock.calls;
      const outer = calls.find((c) => c[0]?.name === "DrizzleWebhookEndpointRepository > create");
      const inner = calls.find((c) => c[0]?.op === "db.query");
      expect(outer).toBeDefined();
      expect(inner).toBeDefined();
      expect(inner?.[0]?.attributes?.["db.system.name"]).toBe("postgresql");
    });

    it("failure path: DB throws → instrumentation.capture called + Result.fail", async () => {
      const boom = new Error("db boom");
      const captureSpy = spyOn(instrumentation, "capture");
      injectDbError(instrumentation, boom);

      const result = await repo.create({
        id: "ep-1",
        organizationId: "org-1",
        url: "https://example.com/hook",
        secretCipher: "cipher",
        eventTypes: [],
        enabled: true,
      });

      expect(result.isFailure).toBe(true);
      expect(result.getError().code).toBe("WEBHOOK_PERSISTENCE_PROVIDER_FAILURE");
      expect(captureSpy).toHaveBeenCalledWith(boom);
    });

    it("failure path: insert returns no row → Result.fail", async () => {
      dbBehavior = async () => [];

      const result = await repo.create({
        id: "ep-1",
        organizationId: "org-1",
        url: "https://example.com/hook",
        secretCipher: "cipher",
        eventTypes: [],
        enabled: true,
      });

      expect(result.isFailure).toBe(true);
      expect(result.getError().code).toBe("WEBHOOK_PERSISTENCE_PROVIDER_FAILURE");
    });
  });

  // -------------------------------------------------------------------------
  // update
  // -------------------------------------------------------------------------

  describe("update", () => {
    it("happy path: returns Option.some when row found", async () => {
      dbBehavior = async () => [fakeRow];

      const result = await repo.update({ id: "ep-1", organizationId: "org-1", enabled: false });

      expect(result.isSuccess).toBe(true);
      expect(result.getValue().isSome()).toBe(true);
      expect(result.getValue().unwrap().enabled).toBe(true); // fakeRow.enabled
    });

    it("happy path: returns Option.none when no row matched", async () => {
      dbBehavior = async () => [];

      const result = await repo.update({ id: "ep-99", organizationId: "org-1" });

      expect(result.isSuccess).toBe(true);
      expect(result.getValue().isNone()).toBe(true);
    });

    it("happy path: outer + inner spans emitted", async () => {
      dbBehavior = async () => [fakeRow];
      const spy = spyOn(instrumentation, "startSpan");

      await repo.update({ id: "ep-1", organizationId: "org-1" });

      const calls = spy.mock.calls;
      const outer = calls.find((c) => c[0]?.name === "DrizzleWebhookEndpointRepository > update");
      const inner = calls.find((c) => c[0]?.op === "db.query");
      expect(outer).toBeDefined();
      expect(inner).toBeDefined();
    });

    it("failure path: DB throws → capture called + Result.fail", async () => {
      const boom = new Error("update boom");
      const captureSpy = spyOn(instrumentation, "capture");
      injectDbError(instrumentation, boom);

      const result = await repo.update({ id: "ep-1", organizationId: "org-1" });

      expect(result.isFailure).toBe(true);
      expect(result.getError().code).toBe("WEBHOOK_PERSISTENCE_PROVIDER_FAILURE");
      expect(captureSpy).toHaveBeenCalledWith(boom);
    });
  });

  // -------------------------------------------------------------------------
  // delete
  // -------------------------------------------------------------------------

  describe("delete", () => {
    it("happy path: returns true when row deleted", async () => {
      dbBehavior = async () => [{ id: "ep-1" }];

      const result = await repo.delete("ep-1", "org-1");

      expect(result.isSuccess).toBe(true);
      expect(result.getValue()).toBe(true);
    });

    it("happy path: returns false when no row matched", async () => {
      dbBehavior = async () => [];

      const result = await repo.delete("ep-99", "org-1");

      expect(result.isSuccess).toBe(true);
      expect(result.getValue()).toBe(false);
    });

    it("happy path: outer + inner spans with correct names", async () => {
      dbBehavior = async () => [{ id: "ep-1" }];
      const spy = spyOn(instrumentation, "startSpan");

      await repo.delete("ep-1", "org-1");

      const calls = spy.mock.calls;
      const outer = calls.find((c) => c[0]?.name === "DrizzleWebhookEndpointRepository > delete");
      const inner = calls.find((c) => c[0]?.op === "db.query");
      expect(outer).toBeDefined();
      expect(inner?.[0]?.attributes?.["db.system.name"]).toBe("postgresql");
    });

    it("failure path: DB throws → capture + Result.fail", async () => {
      const boom = new Error("delete boom");
      const captureSpy = spyOn(instrumentation, "capture");
      injectDbError(instrumentation, boom);

      const result = await repo.delete("ep-1", "org-1");

      expect(result.isFailure).toBe(true);
      expect(result.getError().code).toBe("WEBHOOK_PERSISTENCE_PROVIDER_FAILURE");
      expect(captureSpy).toHaveBeenCalledWith(boom);
    });
  });

  // -------------------------------------------------------------------------
  // findById
  // -------------------------------------------------------------------------

  describe("findById", () => {
    it("happy path: returns Option.some when row found", async () => {
      dbBehavior = async () => [fakeRow];

      const result = await repo.findById("ep-1", "org-1");

      expect(result.isSome()).toBe(true);
      expect(result.unwrap().id).toBe("ep-1");
    });

    it("happy path: returns Option.none when no row found", async () => {
      dbBehavior = async () => [];

      const result = await repo.findById("ep-99", "org-1");

      expect(result.isNone()).toBe(true);
    });

    it("happy path: outer + inner spans emitted", async () => {
      dbBehavior = async () => [fakeRow];
      const spy = spyOn(instrumentation, "startSpan");

      await repo.findById("ep-1", "org-1");

      const calls = spy.mock.calls;
      const outer = calls.find((c) => c[0]?.name === "DrizzleWebhookEndpointRepository > findById");
      const inner = calls.find((c) => c[0]?.op === "db.query");
      expect(outer).toBeDefined();
      expect(inner).toBeDefined();
    });
  });

  // -------------------------------------------------------------------------
  // listByOrg
  // -------------------------------------------------------------------------

  describe("listByOrg", () => {
    it("happy path: returns all rows for org", async () => {
      dbBehavior = async () => [fakeRow, { ...fakeRow, id: "ep-2" }];

      const result = await repo.listByOrg("org-1");

      expect(result.isSuccess).toBe(true);
      expect(result.getValue()).toHaveLength(2);
      expect(result.getValue()[0]?.id).toBe("ep-1");
    });

    it("happy path: returns empty array when org has no endpoints", async () => {
      dbBehavior = async () => [];

      const result = await repo.listByOrg("org-empty");

      expect(result.isSuccess).toBe(true);
      expect(result.getValue()).toEqual([]);
    });

    it("happy path: outer span name and inner db.query span present", async () => {
      dbBehavior = async () => [];
      const spy = spyOn(instrumentation, "startSpan");

      await repo.listByOrg("org-1");

      const calls = spy.mock.calls;
      const outer = calls.find(
        (c) => c[0]?.name === "DrizzleWebhookEndpointRepository > listByOrg",
      );
      const inner = calls.find((c) => c[0]?.op === "db.query");
      expect(outer).toBeDefined();
      expect(inner?.[0]?.attributes?.["db.system.name"]).toBe("postgresql");
    });

    it("failure path: DB throws → capture + Result.fail", async () => {
      const boom = new Error("list boom");
      const captureSpy = spyOn(instrumentation, "capture");
      injectDbError(instrumentation, boom);

      const result = await repo.listByOrg("org-1");

      expect(result.isFailure).toBe(true);
      expect(result.getError().code).toBe("WEBHOOK_PERSISTENCE_PROVIDER_FAILURE");
      expect(captureSpy).toHaveBeenCalledWith(boom);
    });
  });

  // -------------------------------------------------------------------------
  // applySecretRotation
  // -------------------------------------------------------------------------

  describe("applySecretRotation", () => {
    it("happy path: updates both secrets and returns the record", async () => {
      dbBehavior = async () => [
        {
          ...fakeRow,
          secretCipher: "new-cipher",
          previousSecretCipher: "old-cipher",
          previousSecretExpiresAt: new Date("2030-01-01"),
        },
      ];

      const r = await repo.applySecretRotation(
        {
          id: "ep-1",
          organizationId: "org-1",
          secretCipher: "new-cipher",
          previousSecretCipher: "old-cipher",
          previousSecretExpiresAt: new Date("2030-01-01"),
        },
        tx,
      );

      expect(r.isSuccess).toBe(true);
      expect(r.getValue().isSome()).toBe(true);
      expect(r.getValue().unwrap().secretCipher).toBe("new-cipher");
      expect(r.getValue().unwrap().previousSecretCipher.unwrap()).toBe("old-cipher");
    });

    it("happy path: returns Option.none when no row matched", async () => {
      dbBehavior = async () => [];

      const r = await repo.applySecretRotation(
        {
          id: "ep-99",
          organizationId: "org-1",
          secretCipher: "x",
          previousSecretCipher: "y",
          previousSecretExpiresAt: new Date(),
        },
        tx,
      );

      expect(r.isSuccess).toBe(true);
      expect(r.getValue().isNone()).toBe(true);
    });

    it("failure path: DB throws → capture + Result.fail", async () => {
      const boom = new Error("rotation boom");
      const captureSpy = spyOn(instrumentation, "capture");
      injectDbError(instrumentation, boom);

      const r = await repo.applySecretRotation(
        {
          id: "ep-1",
          organizationId: "org-1",
          secretCipher: "x",
          previousSecretCipher: "y",
          previousSecretExpiresAt: new Date(),
        },
        tx,
      );

      expect(r.isFailure).toBe(true);
      expect(r.getError().code).toBe("WEBHOOK_PERSISTENCE_PROVIDER_FAILURE");
      expect(captureSpy).toHaveBeenCalledWith(boom);
    });
  });

  // -------------------------------------------------------------------------
  // bumpFailure
  // -------------------------------------------------------------------------

  describe("bumpFailure", () => {
    it("happy path: returns the incremented counters", async () => {
      const failedAt = new Date("2024-06-01");
      dbBehavior = async () => [{ consecutiveFailures: 3, firstFailedAt: failedAt }];

      const r = await repo.bumpFailure("ep-1", "org-1", tx);

      expect(r.isSuccess).toBe(true);
      expect(r.getValue().isSome()).toBe(true);
      expect(r.getValue().unwrap().consecutiveFailures).toBe(3);
      expect(r.getValue().unwrap().firstFailedAt).toBe(failedAt);
    });

    it("happy path: returns Option.none when no row matched", async () => {
      dbBehavior = async () => [];

      const r = await repo.bumpFailure("ep-99", "org-1", tx);

      expect(r.isSuccess).toBe(true);
      expect(r.getValue().isNone()).toBe(true);
    });

    it("failure path: DB throws → capture + Result.fail", async () => {
      const boom = new Error("bump boom");
      const captureSpy = spyOn(instrumentation, "capture");
      injectDbError(instrumentation, boom);

      const r = await repo.bumpFailure("ep-1", "org-1", tx);

      expect(r.isFailure).toBe(true);
      expect(r.getError().code).toBe("WEBHOOK_PERSISTENCE_PROVIDER_FAILURE");
      expect(captureSpy).toHaveBeenCalledWith(boom);
    });
  });

  // -------------------------------------------------------------------------
  // resetFailure
  // -------------------------------------------------------------------------

  describe("resetFailure", () => {
    it("happy path: returns Result.ok(undefined)", async () => {
      dbBehavior = async () => [];

      const r = await repo.resetFailure("ep-1", "org-1", tx);

      expect(r.isSuccess).toBe(true);
    });

    it("failure path: DB throws → capture + Result.fail", async () => {
      const boom = new Error("reset boom");
      const captureSpy = spyOn(instrumentation, "capture");
      injectDbError(instrumentation, boom);

      const r = await repo.resetFailure("ep-1", "org-1", tx);

      expect(r.isFailure).toBe(true);
      expect(r.getError().code).toBe("WEBHOOK_PERSISTENCE_PROVIDER_FAILURE");
      expect(captureSpy).toHaveBeenCalledWith(boom);
    });
  });

  // -------------------------------------------------------------------------
  // markDisabled
  // -------------------------------------------------------------------------

  describe("markDisabled", () => {
    it("happy path: returns Result.ok(undefined)", async () => {
      dbBehavior = async () => [];

      const r = await repo.markDisabled("ep-1", "org-1", new Date(), tx);

      expect(r.isSuccess).toBe(true);
    });

    it("failure path: DB throws → capture + Result.fail", async () => {
      const boom = new Error("disable boom");
      const captureSpy = spyOn(instrumentation, "capture");
      injectDbError(instrumentation, boom);

      const r = await repo.markDisabled("ep-1", "org-1", new Date(), tx);

      expect(r.isFailure).toBe(true);
      expect(r.getError().code).toBe("WEBHOOK_PERSISTENCE_PROVIDER_FAILURE");
      expect(captureSpy).toHaveBeenCalledWith(boom);
    });
  });

  // -------------------------------------------------------------------------
  // update — enabled:true clears failure state
  // -------------------------------------------------------------------------

  describe("update (re-enable clears failure state)", () => {
    it("happy path: enabled:true yields a record with consecutiveFailures:0 and disabledAt:null", async () => {
      dbBehavior = async () => [
        {
          ...fakeRow,
          enabled: true,
          consecutiveFailures: 0,
          firstFailedAt: null,
          disabledAt: null,
        },
      ];

      const result = await repo.update({ id: "ep-1", organizationId: "org-1", enabled: true });

      expect(result.isSuccess).toBe(true);
      expect(result.getValue().isSome()).toBe(true);
      expect(result.getValue().unwrap().consecutiveFailures).toBe(0);
      expect(result.getValue().unwrap().disabledAt.isNone()).toBe(true);
    });
  });
});
