import { beforeEach, describe, expect, it, mock, spyOn } from "bun:test";

// ── Mock @packages/drizzle ─────────────────────────────────────────────────
// Expose full export surface to avoid cross-file export-not-found errors under parallel bun test.
const insertExecute = mock(async () => {});
const selectExecute = mock(async () => [] as unknown[]);

function makeQueryChain(executeMock: ReturnType<typeof mock>) {
  const leaf = {
    execute: executeMock,
    toSQL: () => ({ sql: "SELECT 1" }),
  };
  const proxy: unknown = new Proxy(leaf, {
    get(target, prop) {
      if (prop === "execute" || prop === "toSQL") return Reflect.get(target, prop);
      return () => proxy;
    },
  });
  return proxy;
}

const fakeDb = {
  insert: () => makeQueryChain(insertExecute),
  select: () => makeQueryChain(selectExecute),
};

const fakeTx = {
  insert: () => makeQueryChain(insertExecute),
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
  desc: () => ({}),
  like: () => ({}),
  inArray: () => ({}),
  count: () => ({}),
  arrayContains: () => ({}),
  sql: Object.assign((_strings: TemplateStringsArray, ..._values: unknown[]) => ({}), {
    raw: () => ({}),
  }),
  outboxSchema: { outboxEvent: {} },
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
  multiTenantSchema: {},
  authSchema: {},
  schema: {},
  trackEventsOnSuccess: () => {},
  TransactionService: class {},
}));

// ── Imports after mocks ────────────────────────────────────────────────────
const { DrizzleAuditRepository } = await import("../services/drizzle-audit.service");
const { NoOpInstrumentation } = await import("../services/noop-instrumentation");

// ── Helpers ────────────────────────────────────────────────────────────────
const baseEntry = {
  actorId: "u1",
  actorType: "user" as const,
  organizationId: "org-1",
  action: "user.deleted",
  targetType: "user",
  targetId: "u2",
  metadata: { reason: "test" },
  retention: "compliance" as const,
};

const baseFilters = {};

// ── Tests ──────────────────────────────────────────────────────────────────
describe("DrizzleAuditRepository", () => {
  beforeEach(() => {
    insertExecute.mockReset();
    insertExecute.mockResolvedValue(undefined);
    selectExecute.mockReset();
    selectExecute.mockResolvedValue([]);
  });

  describe("record", () => {
    it("calls outer startSpan with name 'DrizzleAuditRepository > record'", async () => {
      const instr = new NoOpInstrumentation();
      const spy = spyOn(instr, "startSpan").mockImplementation(((_opts, cb) =>
        (cb as () => Promise<unknown>)()) as typeof instr.startSpan);
      const repo = new DrizzleAuditRepository(instr);
      await repo.record(baseEntry);
      expect(spy).toHaveBeenCalledWith(
        expect.objectContaining({ name: "DrizzleAuditRepository > record" }),
        expect.any(Function),
      );
    });

    it("calls inner startSpan with op: 'db.query'", async () => {
      const instr = new NoOpInstrumentation();
      const spy = spyOn(instr, "startSpan").mockImplementation(((_opts, cb) =>
        (cb as () => Promise<unknown>)()) as typeof instr.startSpan);
      const repo = new DrizzleAuditRepository(instr);
      await repo.record(baseEntry);
      const innerCall = spy.mock.calls.find((c) => c[0]?.op === "db.query");
      expect(innerCall).toBeDefined();
    });

    it("returns Result.ok with id and occurredAt on success", async () => {
      const repo = new DrizzleAuditRepository(new NoOpInstrumentation());
      const result = await repo.record(baseEntry);
      expect(result.isSuccess).toBe(true);
      const val = result.getValue();
      expect(typeof val.id).toBe("string");
      expect(val.id.length).toBeGreaterThan(0);
      expect(val.occurredAt).toBeInstanceOf(Date);
      expect(val.action).toBe(baseEntry.action);
    });

    it("uses provided tx instead of module-level db", async () => {
      const repo = new DrizzleAuditRepository(new NoOpInstrumentation());
      const result = await repo.record(baseEntry, fakeTx as never);
      expect(result.isSuccess).toBe(true);
    });

    it("calls instrumentation.capture and returns Result.fail on DB error", async () => {
      const instr = new NoOpInstrumentation();
      const captureSpy = spyOn(instr, "capture");
      let callCount = 0;
      spyOn(instr, "startSpan").mockImplementation(((_opts, cb) => {
        callCount++;
        if (callCount === 2) throw new Error("db fail");
        return (cb as () => Promise<unknown>)();
      }) as typeof instr.startSpan);
      const repo = new DrizzleAuditRepository(instr);
      const result = await repo.record(baseEntry);
      expect(result.isFailure).toBe(true);
      expect(result.getError().code).toBe("AUDIT_PERSISTENCE_PROVIDER_FAILURE");
      expect(captureSpy).toHaveBeenCalled();
    });
  });

  describe("list", () => {
    it("calls outer startSpan with name 'DrizzleAuditRepository > list'", async () => {
      const instr = new NoOpInstrumentation();
      const spy = spyOn(instr, "startSpan").mockImplementation(((_opts, cb) =>
        (cb as () => Promise<unknown>)()) as typeof instr.startSpan);
      const repo = new DrizzleAuditRepository(instr);
      await repo.list(baseFilters);
      expect(spy).toHaveBeenCalledWith(
        expect.objectContaining({ name: "DrizzleAuditRepository > list" }),
        expect.any(Function),
      );
    });

    it("calls inner startSpan with op: 'db.query'", async () => {
      const instr = new NoOpInstrumentation();
      const spy = spyOn(instr, "startSpan").mockImplementation(((_opts, cb) =>
        (cb as () => Promise<unknown>)()) as typeof instr.startSpan);
      const repo = new DrizzleAuditRepository(instr);
      await repo.list(baseFilters);
      const innerCall = spy.mock.calls.find((c) => c[0]?.op === "db.query");
      expect(innerCall).toBeDefined();
    });

    it("returns Result.ok with empty items and null nextCursor when no rows", async () => {
      const repo = new DrizzleAuditRepository(new NoOpInstrumentation());
      const result = await repo.list(baseFilters);
      expect(result.isSuccess).toBe(true);
      expect(result.getValue().items).toEqual([]);
      expect(result.getValue().nextCursor).toBeNull();
    });

    it("paginates: sets nextCursor when rows exceed limit", async () => {
      // Return limit+1 rows to trigger hasMore
      const limit = 2;
      const row = {
        id: "r1",
        actorId: "u1",
        actorType: "user",
        organizationId: "org-1",
        action: "x",
        targetType: "user",
        targetId: "u2",
        metadata: {},
        requestId: null,
        retention: "compliance",
        occurredAt: new Date("2024-01-01"),
        prevHash: null,
        hash: null,
      };
      const rows = [
        { ...row, id: "r1", occurredAt: new Date("2024-01-03") },
        { ...row, id: "r2", occurredAt: new Date("2024-01-02") },
        { ...row, id: "r3", occurredAt: new Date("2024-01-01") }, // this is the extra one
      ];
      selectExecute.mockResolvedValueOnce(rows);
      const repo = new DrizzleAuditRepository(new NoOpInstrumentation());
      const result = await repo.list({ limit });
      expect(result.isSuccess).toBe(true);
      const page = result.getValue();
      expect(page.items).toHaveLength(2);
      expect(page.nextCursor).toBe(new Date("2024-01-02").toISOString());
    });

    it("calls instrumentation.capture and returns Result.fail on DB error", async () => {
      const instr = new NoOpInstrumentation();
      const captureSpy = spyOn(instr, "capture");
      let callCount = 0;
      spyOn(instr, "startSpan").mockImplementation(((_opts, cb) => {
        callCount++;
        if (callCount === 2) throw new Error("db fail");
        return (cb as () => Promise<unknown>)();
      }) as typeof instr.startSpan);
      const repo = new DrizzleAuditRepository(instr);
      const result = await repo.list(baseFilters);
      expect(result.isFailure).toBe(true);
      expect(result.getError().code).toBe("AUDIT_PERSISTENCE_PROVIDER_FAILURE");
      expect(captureSpy).toHaveBeenCalled();
    });
  });
});
