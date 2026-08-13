import { describe, expect, it, mock } from "bun:test";
import { Option } from "@packages/ddd-kit";

const inserted: unknown[] = [];
const execCalls: string[] = [];

mock.module("@packages/drizzle", () => ({
  db: {
    insert: () => ({
      values: async (rows: unknown[]) => {
        inserted.push(...rows);
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
  multiTenantSchema: {},
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
      dedupKey: { name: "dedup_key" },
      readAt: { name: "read_at" },
      createdAt: { name: "created_at" },
      id: {},
    },
  },
}));

const { DrizzleEmailQueue } = await import("../services/drizzle-email-queue.service");
const { NoOpInstrumentation } = await import("../services/noop-instrumentation");

describe("DrizzleEmailQueue.enqueue", () => {
  it("assigns an id and pending status to every row", async () => {
    const queue = new DrizzleEmailQueue(new NoOpInstrumentation());
    const result = await queue.enqueue([
      {
        kind: "template",
        template: Option.some("verify_email"),
        toAddress: "a@x.test",
        subject: "s",
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
        values: async () => {
          throw new Error("db down");
        },
      }),
    };
    const result = await queue.enqueue(
      [
        {
          kind: "raw",
          template: Option.none(),
          toAddress: "a@x.test",
          subject: "s",
          payload: {},
          idempotencyKey: Option.none(),
        },
      ],
      tx as never,
    );
    expect(result.isFailure).toBe(true);
    expect(result.getError().code).toBe("EMAIL_QUEUE_WRITE_FAILED");
  });
});
