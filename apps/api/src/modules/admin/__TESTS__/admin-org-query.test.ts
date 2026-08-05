import { describe, expect, it, mock } from "bun:test";

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
    "groupBy",
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
    member: { userId: {}, organizationId: {}, role: {}, id: {} },
    organization: { id: {}, name: {}, slug: {}, createdAt: {} },
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
  billingSchema: { subscription: { plan: {}, referenceId: {} } },
  quotaUsageSchema: {
    quotaUsage: { organizationId: {}, resource: {}, periodStart: {}, used: {}, updatedAt: {} },
  },
  policiesSchema: {},
  consentSchema: {},
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
  sql: Object.assign(mk("sql"), { raw: mk("sql.raw") }),
}));

const { AdminQueryService } = await import("../application/services/admin-query.service");

const instrumentation = {
  startSpan: <T>(_o: unknown, fn: () => T) => fn(),
  capture: mock(() => {}),
  addBreadcrumb: mock(() => {}),
};

describe("AdminQueryService orgs", () => {
  it("lists orgs with their member count", async () => {
    const orgStore = {
      listOrgs: mock(async () => [
        {
          id: "o-1",
          name: "Acme",
          slug: "acme",
          memberCount: 3,
          createdAt: new Date("2026-01-01"),
        },
      ]),
      findOrgById: mock(async () => null),
      listMembersOf: mock(async () => []),
      findPlanFor: mock(async () => null),
    };
    const service = new AdminQueryService({} as never, instrumentation as never, orgStore as never);
    const page = (await service.listOrgs({ limit: 50 })).getValue();
    expect(page.items[0]?.memberCount).toBe(3);
  });

  it("returns none for an unknown org", async () => {
    const orgStore = {
      listOrgs: mock(async () => []),
      findOrgById: mock(async () => null),
      listMembersOf: mock(async () => []),
      findPlanFor: mock(async () => null),
    };
    const service = new AdminQueryService({} as never, instrumentation as never, orgStore as never);
    expect((await service.getOrg("nope")).getValue().isNone()).toBe(true);
  });

  it("exposes the plan as an Option when the org has no subscription", async () => {
    const orgStore = {
      listOrgs: mock(async () => []),
      findOrgById: mock(async () => ({
        id: "o-1",
        name: "Acme",
        slug: "acme",
        memberCount: 1,
        createdAt: new Date("2026-01-01"),
      })),
      listMembersOf: mock(async () => [{ userId: "u-1", email: "a@example.com", role: "owner" }]),
      findPlanFor: mock(async () => null),
    };
    const service = new AdminQueryService({} as never, instrumentation as never, orgStore as never);
    const detail = (await service.getOrg("o-1")).getValue().unwrap();
    expect(detail.plan.isNone()).toBe(true);
  });
});
