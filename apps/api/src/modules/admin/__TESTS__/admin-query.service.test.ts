import { describe, expect, it, mock } from "bun:test";
import { Option } from "@packages/ddd-kit";
import * as sweepSchema from "../../../../../../packages/drizzle/src/schema/sweep";

const rows = [
  {
    id: "u-1",
    email: "a@example.com",
    name: "A",
    role: "admin",
    banned: false,
    banReason: null,
    banExpires: null,
    twoFactorEnabled: true,
    createdAt: new Date("2026-01-01"),
  },
];

type SqlMarker = { _op: string; args: unknown[] };
const mk =
  (op: string) =>
  (...args: unknown[]): SqlMarker => ({ _op: op, args });

function buildQuery(result: () => Promise<unknown[]>) {
  const q: Record<string, unknown> = {
    toSQL: () => ({ sql: "SELECT 1", params: [] }),
    execute: result,
    where: () => buildQuery(result),
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

mock.module("@packages/drizzle", () => ({
  db: {
    select: () => buildQuery(async () => []),
    insert: () => buildQuery(async () => []),
    update: () => buildQuery(async () => []),
    delete: () => buildQuery(async () => []),
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
    session: {
      id: {},
      createdAt: {},
      expiresAt: {},
      ipAddress: {},
      userAgent: {},
      impersonatedBy: {},
      userId: {},
    },
  },
  multiTenantSchema: {
    member: { userId: {}, organizationId: {}, role: {} },
    organization: { id: {}, name: {} },
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
  sweepSchema,
}));

const { AdminQueryService } = await import("../application/services/admin-query.service");

const instrumentation = {
  startSpan: <T>(_o: unknown, fn: () => T) => fn(),
  capture: mock(() => {}),
  addBreadcrumb: mock(() => {}),
};

function serviceReturning(result: unknown[]) {
  const store = {
    listUsers: mock(async () => result),
  };
  return new AdminQueryService(store as never, instrumentation as never, {} as never);
}

describe("AdminQueryService", () => {
  describe("listUsers", () => {
    it("returns the page items with Option-wrapped nullable columns", async () => {
      const service = serviceReturning(rows);
      const result = await service.listUsers({ limit: 50 });
      expect(result.isSuccess).toBe(true);
      const page = result.getValue();
      expect(page.items[0]?.role.unwrap()).toBe("admin");
      expect(page.items[0]?.banReason.isNone()).toBe(true);
    });

    it("returns no cursor when the page is not full", async () => {
      const service = serviceReturning(rows);
      const page = (await service.listUsers({ limit: 50 })).getValue();
      expect(page.nextCursor.isNone()).toBe(true);
    });

    it("returns a cursor when the page is exactly full", async () => {
      const service = serviceReturning(rows);
      const page = (await service.listUsers({ limit: 1 })).getValue();
      expect(page.nextCursor.isSome()).toBe(true);
      expect(page.nextCursor.unwrap()).toBe(new Date("2026-01-01").toISOString());
    });

    it("passes organizationId filter through to the store", async () => {
      const store = { listUsers: mock(async () => rows) };
      const service = new AdminQueryService(store as never, instrumentation as never, {} as never);
      await service.listUsers({ limit: 50, organizationId: "org-1" });
      expect(store.listUsers).toHaveBeenCalledWith(
        expect.objectContaining({ organizationId: "org-1" }),
      );
    });

    it("captures the error and fails when the store throws", async () => {
      const store = {
        listUsers: mock(async () => {
          throw new Error("boom");
        }),
      };
      const service = new AdminQueryService(store as never, instrumentation as never, {} as never);
      const result = await service.listUsers({ limit: 50 });
      expect(result.isFailure).toBe(true);
      expect(instrumentation.capture).toHaveBeenCalled();
    });
  });

  describe("getUser", () => {
    it("returns none when the user does not exist", async () => {
      const store = {
        listUsers: mock(async () => []),
        findUserById: mock(async () => Option.none()),
        listSessionsFor: mock(async () => []),
        listMembershipsFor: mock(async () => []),
      };
      const service = new AdminQueryService(store as never, instrumentation as never, {} as never);
      const result = await service.getUser("missing");
      expect(result.isSuccess).toBe(true);
      expect(result.getValue().isNone()).toBe(true);
    });

    it("assembles sessions and memberships for an existing user", async () => {
      const store = {
        listUsers: mock(async () => []),
        findUserById: mock(async () => Option.some(rows[0])),
        listSessionsFor: mock(async () => [
          {
            id: "s-1",
            createdAt: new Date("2026-02-01"),
            expiresAt: new Date("2026-02-02"),
            ipAddress: "1.2.3.4",
            userAgent: null,
            impersonatedBy: "admin-1",
          },
        ]),
        listMembershipsFor: mock(async () => [
          { organizationId: "o-1", organizationName: "Acme", role: "owner" },
        ]),
      };
      const service = new AdminQueryService(store as never, instrumentation as never, {} as never);
      const detail = (await service.getUser("u-1")).getValue().unwrap();
      expect(detail.sessions[0]?.impersonatedBy.unwrap()).toBe("admin-1");
      expect(detail.memberships[0]?.organizationName).toBe("Acme");
    });
  });
});
