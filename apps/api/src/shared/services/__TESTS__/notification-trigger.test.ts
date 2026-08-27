import { describe, expect, mock, test } from "bun:test";

const fakeSql = Object.assign(
  (strings: TemplateStringsArray) => ({
    toSQL: () => ({ sql: strings.join(""), params: [] as unknown[] }),
  }),
  {
    raw: (_s: string) => ({}),
    identifier: (_s: string) => ({}),
  },
);

mock.module("@packages/drizzle", () => ({
  db: {},
  sql: fakeSql,
  eq: () => ({}),
  and: () => ({}),
  or: () => ({}),
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
  outboxSchema: { outboxEvent: {} },
  auditLogSchema: { auditLog: {} },
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
  apiTokenSchema: {},
}));

import { ensureNotificationTrigger } from "../notification-trigger";

describe("ensureNotificationTrigger", () => {
  function makeClient() {
    const executed: Array<{ toSQL: () => { sql: string } }> = [];
    const client = {
      execute: mock(async (query: { toSQL: () => { sql: string } }) => {
        executed.push(query);
      }),
    };
    return { client, executed };
  }

  test("appelle execute et emet le DDL attendu", async () => {
    const { client, executed } = makeClient();

    await ensureNotificationTrigger(client as never);

    expect(client.execute).toHaveBeenCalledTimes(2);

    const fnDdl = executed[0]?.toSQL().sql ?? "";
    const triggerDdl = executed[1]?.toSQL().sql ?? "";

    expect(fnDdl).toContain("CREATE OR REPLACE");
    expect(fnDdl).toContain("notification_created");
    expect(fnDdl).toContain("NEW.user_id");

    expect(triggerDdl).toContain("CREATE OR REPLACE");
    expect(triggerDdl).toContain("notification_notify_trigger");
  });

  test("est idempotent - deux appels ne levent pas d'erreur", async () => {
    const { client } = makeClient();

    await ensureNotificationTrigger(client as never);
    await ensureNotificationTrigger(client as never);

    expect(client.execute).toHaveBeenCalledTimes(4);

    const sqls = (client.execute as ReturnType<typeof mock>).mock.calls.map(
      (c) => (c[0] as { toSQL: () => { sql: string } }).toSQL().sql,
    );
    for (const s of sqls) {
      expect(s).toContain("CREATE OR REPLACE");
    }
  });
});
