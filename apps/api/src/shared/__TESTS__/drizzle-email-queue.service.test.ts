import { describe, expect, it, mock } from "bun:test";
import { Option } from "@packages/ddd-kit";

const inserted: unknown[] = [];
const execCalls: string[] = [];

// Set by a test to make the insert report fewer written rows than requested.
let insertReturns: ((rows: unknown[]) => unknown[]) | null = null;

const warnSpy = mock(() => {});
mock.module("../logger", () => ({
  logger: { warn: warnSpy, info: mock(() => {}), error: mock(() => {}), debug: mock(() => {}) },
}));

mock.module("@packages/drizzle", () => ({
  db: {
    insert: () => ({
      values: (rows: unknown[]) => {
        inserted.push(...rows);
        const written = insertReturns ? insertReturns(rows) : rows.map(() => ({ id: "id" }));
        const chain = {
          onConflictDoNothing: () => chain,
          returning: async () => written,
          // biome-ignore lint/suspicious/noThenProperty: intentional thenable so the old `await ....values(...)` call shape still works
          then: (resolve: (v: unknown) => unknown) => resolve(written),
        };
        return chain;
      },
    }),
  },
  emailSchema: { emailMessage: { id: "id", status: "status", attempts: "attempts" } },
  and: (...a: unknown[]) => a,
  eq: (...a: unknown[]) => a,
  inArray: (...a: unknown[]) => a,
  isNull: (...a: unknown[]) => a,
  isNotNull: (...a: unknown[]) => a,
  lte: (...a: unknown[]) => a,
  or: (...a: unknown[]) => a,
  lt: (...a: unknown[]) => a,
  gt: (...a: unknown[]) => a,
  gte: (...a: unknown[]) => a,
  not: (...a: unknown[]) => a,
  asc: (...a: unknown[]) => a,
  desc: (...a: unknown[]) => a,
  like: (...a: unknown[]) => a,
  count: (...a: unknown[]) => a,
  arrayContains: (...a: unknown[]) => a,
  sql: Object.assign(
    (s: TemplateStringsArray) => {
      execCalls.push(s.join(""));
      return s.join("");
    },
    {
      raw: () => ({}),
      identifier: () => ({}),
      join: (chunks: unknown[]) => chunks,
    },
  ),
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
}));

const { DrizzleEmailQueue } = await import("../services/drizzle-email-queue.service");
const { NoOpInstrumentation } = await import("../services/noop-instrumentation");

const rowFixture = (to: string) => ({
  kind: "template" as const,
  template: Option.some("delete_completed"),
  toAddress: to,
  subject: "s",
  locale: "en" as const,
  payload: { name: "Ada" },
  idempotencyKey: Option.some(`k/${to}`),
});

describe("DrizzleEmailQueue.enqueue", () => {
  it("assigns an id and pending status to every row", async () => {
    const queue = new DrizzleEmailQueue(new NoOpInstrumentation());
    const result = await queue.enqueue([
      {
        kind: "template",
        template: Option.some("verify_email"),
        toAddress: "a@x.test",
        subject: "s",
        locale: "en",
        payload: {},
        idempotencyKey: Option.none(),
      },
    ]);
    expect(result.isSuccess).toBe(true);
    expect(inserted).toHaveLength(1);
    expect((inserted[0] as { status: string }).status).toBe("pending");
    expect((inserted[0] as { id: string }).id).toBeTruthy();
  });

  it("returns a failure Result instead of throwing when the insert rejects", async () => {
    const queue = new DrizzleEmailQueue(new NoOpInstrumentation());
    const tx = {
      insert: () => ({
        values: () => ({
          onConflictDoNothing: () => ({
            returning: async () => {
              throw new Error("db down");
            },
          }),
        }),
      }),
    };
    const result = await queue.enqueue(
      [
        {
          kind: "raw",
          template: Option.none(),
          toAddress: "a@x.test",
          subject: "s",
          locale: "en",
          payload: {},
          idempotencyKey: Option.none(),
        },
      ],
      tx as never,
    );
    expect(result.isFailure).toBe(true);
    expect(result.getError().code).toBe("EMAIL_QUEUE_WRITE_FAILED");
  });

  it("suppresses a duplicate row instead of failing the whole batch", async () => {
    insertReturns = (rows) => rows.slice(1).map(() => ({ id: "id" })); // one row dropped
    const queue = new DrizzleEmailQueue(new NoOpInstrumentation());

    const result = await queue.enqueue([rowFixture("a@x.test"), rowFixture("b@x.test")]);

    expect(result.isSuccess).toBe(true);
    insertReturns = null;
  });

  it("warns when fewer rows are written than requested", async () => {
    warnSpy.mockClear();
    insertReturns = (rows) => rows.slice(1).map(() => ({ id: "id" }));

    await new DrizzleEmailQueue(new NoOpInstrumentation()).enqueue([
      rowFixture("a@x.test"),
      rowFixture("b@x.test"),
    ]);

    expect(warnSpy).toHaveBeenCalledTimes(1);
    insertReturns = null;
  });
});

describe("DrizzleEmailQueue.markSent", () => {
  it("issues a single statement for many ids", async () => {
    const updates: unknown[] = [];
    const tx = {
      update: () => ({
        set: () => ({
          where: () => ({
            toSQL: () => ({ sql: "update" }),
            execute: async () => {
              updates.push(1);
            },
          }),
        }),
      }),
    };

    const result = await new DrizzleEmailQueue(new NoOpInstrumentation()).markSent(
      ["a", "b", "c"],
      new Date(),
      { a: "p1", b: "p2" },
      tx as never,
    );

    expect(result.isSuccess).toBe(true);
    expect(updates).toHaveLength(1);
  });

  it("is a no-op for an empty id list", async () => {
    let called = false;
    const tx = {
      update: () => {
        called = true;
        return {} as never;
      },
    };

    const result = await new DrizzleEmailQueue(new NoOpInstrumentation()).markSent(
      [],
      new Date(),
      {},
      tx as never,
    );

    expect(result.isSuccess).toBe(true);
    expect(called).toBe(false);
  });
});
