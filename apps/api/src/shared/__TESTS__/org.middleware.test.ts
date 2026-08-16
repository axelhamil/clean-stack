import { describe, expect, it, mock } from "bun:test";
import { Hono } from "hono";

let nextRoleRows: Array<{ role: string }> = [];

// Mock exposes the FULL surface of @packages/drizzle — superset rule (see shared/CLAUDE.md):
// mock.module leaks across parallel bun processes; partial mocks cause "Export not found" in others.
mock.module("@packages/drizzle", () => ({
  db: {
    select: () => ({
      from: () => ({
        where: () =>
          Object.assign(Promise.resolve(nextRoleRows), {
            limit: () => Promise.resolve(nextRoleRows),
          }),
      }),
    }),
  },
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
  schema: { member: { role: {}, organizationId: {}, userId: {} } },
  outboxSchema: { outboxEvent: {} },
  auditLogSchema: { auditLog: {} },
  webhooksSchema: { webhookDelivery: {} },
  multiTenantSchema: {},
  authSchema: {},
  TransactionService: class {},
  trackEventsOnSuccess: () => {},
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

const { requireOrg, requireOrgPermission } = await import("../middleware/org.middleware");

type TestEnv = {
  Variables: {
    session: { activeOrganizationId: string | null } | null;
    user: { id: string };
    orgId: string;
  };
};

function buildApp(opts: {
  session?: { activeOrganizationId: string | null } | null;
  orgIdPreset?: string;
  user?: { id: string };
  middleware: ReturnType<typeof requireOrgPermission> | typeof requireOrg;
}) {
  return new Hono<TestEnv>()
    .use("*", async (c, next) => {
      if (opts.session !== undefined) c.set("session", opts.session);
      if (opts.orgIdPreset !== undefined) c.set("orgId", opts.orgIdPreset);
      if (opts.user !== undefined) c.set("user", opts.user);
      await next();
    })
    .use("*", opts.middleware)
    .get("/test", (c) => c.json({ ok: true, orgId: c.get("orgId") }));
}

describe("requireOrg", () => {
  it("should set orgId on context when session has an activeOrganizationId", async () => {
    const res = await buildApp({
      session: { activeOrganizationId: "org-123" },
      middleware: requireOrg,
    }).request("/test");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, orgId: "org-123" });
  });

  it("should reject with 403 when no active organization is in session", async () => {
    const res = await buildApp({
      session: { activeOrganizationId: null },
      middleware: requireOrg,
    }).request("/test");
    expect(res.status).toBe(403);
  });
});

describe("requireOrgPermission", () => {
  it("should reject with 403 when the role lacks the requested capability (wire test: loadRole → authorizeRole → 403)", async () => {
    nextRoleRows = [{ role: "member" }];
    const res = await buildApp({
      orgIdPreset: "org-123",
      user: { id: "user-1" },
      middleware: requireOrgPermission({ organization: ["delete"] }),
    }).request("/test");
    expect(res.status).toBe(403);
  });

  it("should fail with 500 when chained without requireOrg first (orgId missing — wiring guard)", async () => {
    const res = await buildApp({
      user: { id: "user-1" },
      middleware: requireOrgPermission({ organization: ["leave"] }),
    }).request("/test");
    expect(res.status).toBe(500);
  });
});
