import { beforeEach, describe, expect, it, mock, spyOn } from "bun:test";

type SqlMarker = { _op: string; args: unknown[] };
const mk =
  (op: string) =>
  (...args: unknown[]): SqlMarker => ({ _op: op, args });

let dbBehavior: () => Promise<unknown[]> = async () => [];
let capturedWhereArgs: unknown[] = [];

function buildQuery(result: () => Promise<unknown[]>) {
  const q: Record<string, unknown> = {
    toSQL: () => ({ sql: "SELECT 1", params: [] }),
    execute: result,
    where: (arg: unknown) => {
      capturedWhereArgs.push(arg);
      return buildQuery(result);
    },
  };
  for (const m of [
    "select",
    "from",
    "limit",
    "orderBy",
    "innerJoin",
    "leftJoin",
    "insert",
    "update",
    "delete",
    "values",
    "set",
    "returning",
    "for",
  ]) {
    q[m] = () => buildQuery(result);
  }
  return q;
}

function makeDbQuery() {
  return buildQuery(async () => dbBehavior());
}

mock.module("@packages/drizzle", () => ({
  db: {
    select: () => makeDbQuery(),
    insert: () => makeDbQuery(),
    update: () => makeDbQuery(),
    delete: () => makeDbQuery(),
  },
  authSchema: {
    user: {
      id: {},
      email: {},
      name: {},
      role: {},
      banned: {},
      banReason: {},
      banExpires: {},
      twoFactorEnabled: {},
      createdAt: {},
    },
    session: {},
  },
  multiTenantSchema: {
    member: { userId: {}, organizationId: {} },
    organization: {},
  },
  outboxSchema: { outboxEvent: {} },
  auditLogSchema: { auditLog: { hash: {}, sequence: {}, id: {} } },
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
  emailSchema: {},
  schema: {},
  TransactionService: class {},
  trackEventsOnSuccess: () => {},
  uuidv7: () => "generated-uuid",
  and: mk("and"),
  or: mk("or"),
  eq: mk("eq"),
  lt: mk("lt"),
  lte: mk("lte"),
  gt: mk("gt"),
  gte: mk("gte"),
  inArray: mk("inArray"),
  isNull: mk("isNull"),
  isNotNull: mk("isNotNull"),
  ilike: mk("ilike"),
  asc: mk("asc"),
  desc: mk("desc"),
  not: mk("not"),
  like: mk("like"),
  count: mk("count"),
  arrayContains: mk("arrayContains"),
  sql: Object.assign(mk("sql"), { raw: mk("sql.raw"), identifier: () => ({}) }),
}));

const { DrizzleAdminUserStore } = await import(
  "../infrastructure/repositories/drizzle-admin-user.store"
);
const { NoOpInstrumentation } = await import("../../../shared/services/noop-instrumentation");

type InstrType = InstanceType<typeof NoOpInstrumentation>;

const fakeRow = {
  id: "u-1",
  email: "a@example.com",
  name: "A",
  role: "admin",
  banned: false,
  banReason: null,
  banExpires: null,
  twoFactorEnabled: true,
  createdAt: new Date("2026-01-01"),
};

describe("DrizzleAdminUserStore", () => {
  let instrumentation: InstrType;
  let store: InstanceType<typeof DrizzleAdminUserStore>;

  beforeEach(() => {
    instrumentation = new NoOpInstrumentation();
    store = new DrizzleAdminUserStore(instrumentation);
    dbBehavior = async () => [];
    capturedWhereArgs = [];
  });

  describe("listUsers", () => {
    it("returns rows from the db", async () => {
      dbBehavior = async () => [fakeRow];
      const rows = await store.listUsers({ limit: 50 });
      expect(rows).toHaveLength(1);
      expect(rows[0]?.id).toBe("u-1");
    });

    it("passes and(inArray(...)) to .where() when organizationId is set", async () => {
      await store.listUsers({ limit: 50, organizationId: "org-1" });
      const mainArg = capturedWhereArgs[capturedWhereArgs.length - 1] as SqlMarker;
      expect(mainArg).toBeDefined();
      expect(mainArg._op).toBe("and");
      const hasInArray = mainArg.args.some((a) => (a as SqlMarker)?._op === "inArray");
      expect(hasInArray).toBe(true);
    });

    it("passes undefined to .where() when organizationId is absent", async () => {
      await store.listUsers({ limit: 50 });
      expect(capturedWhereArgs[capturedWhereArgs.length - 1]).toBeUndefined();
    });

    it("emits outer and inner db.query spans", async () => {
      const spy = spyOn(instrumentation, "startSpan");
      await store.listUsers({ limit: 50 });
      const calls = spy.mock.calls;
      const outer = calls.find((c) => c[0]?.name === "DrizzleAdminUserStore > listUsers");
      const inner = calls.find((c) => c[0]?.op === "db.query");
      expect(outer).toBeDefined();
      expect(inner).toBeDefined();
      expect(inner?.[0]?.attributes?.["db.system.name"]).toBe("postgresql");
    });

    it("captures the error and rethrows when the db fails", async () => {
      const boom = new Error("db boom");
      const captureSpy = spyOn(instrumentation, "capture");
      let callCount = 0;
      spyOn(instrumentation, "startSpan").mockImplementation(((_opts: unknown, cb: unknown) => {
        callCount++;
        if (callCount === 2) throw boom;
        return (cb as () => Promise<unknown>)();
      }) as typeof instrumentation.startSpan);

      await expect(store.listUsers({ limit: 50 })).rejects.toThrow("db boom");
      expect(captureSpy).toHaveBeenCalledWith(boom);
    });
  });
});
