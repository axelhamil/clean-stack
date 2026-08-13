import { describe, expect, it, mock } from "bun:test";
import { Option, Result } from "@packages/ddd-kit";
import type { EmailMessageRecord } from "../ports/email-queue.port";

mock.module("@packages/drizzle", () => ({
  db: {
    transaction: async (cb: (tx: object) => unknown) => cb({}),
  },
  emailSchema: { emailMessage: {} },
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
  sql: Object.assign((s: TemplateStringsArray) => s.join(""), {
    raw: () => ({}),
    identifier: () => ({}),
  }),
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
  webhooksSchema: { webhookDelivery: {}, webhookEndpoint: {} },
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

mock.module("@packages/emails", () => ({
  renderTemplate: async () => ({ html: "<p>hi</p>", text: "hi", subject: "s" }),
  EMAIL_TEMPLATE_KEYS: [],
}));

const { EmailDeliveryWorker } = await import("../services/email-delivery-worker.service");
const { NoOpInstrumentation } = await import("../services/noop-instrumentation");

const row = (over: Partial<EmailMessageRecord>): EmailMessageRecord => ({
  id: "1",
  kind: "template",
  template: Option.some("delete_completed"),
  toAddress: "a@x.test",
  subject: "s",
  payload: { name: "Ada" },
  status: "pending",
  attempts: 0,
  nextAttemptAt: Option.none<Date>(),
  lastError: Option.none<string>(),
  idempotencyKey: Option.none<string>(),
  createdAt: new Date("2026-08-04T00:00:00Z"),
  ...over,
});

function harness(rows: EmailMessageRecord[]) {
  const sent: string[][] = [];
  const settled: Array<{ id: string; error: string; nextAttemptAt: Option<Date> }> = [];
  let batchImpl: (payload: unknown[]) => Promise<{
    data: Array<{ id: string }> | null;
    errors?: Array<{ index: number; message: string }>;
    error: null | { statusCode?: number; message: string };
  }> = async (p) => ({ data: p.map((_, i) => ({ id: `provider-${i}` })), error: null });

  const sentProviderIds: Record<string, string>[] = [];
  const queue = {
    enqueue: async () => Result.ok<void, never>(undefined),
    claimPending: async () => Result.ok(rows.splice(0, rows.length)),
    markSent: async (ids: string[], _at: Date, providerIds: Record<string, string>) => {
      sent.push(ids);
      sentProviderIds.push(providerIds);
      return Result.ok<void, never>(undefined);
    },
    markFailed: async (id: string, error: string, nextAttemptAt: Option<Date>) => {
      settled.push({ id, error, nextAttemptAt });
      return Result.ok<void, never>(undefined);
    },
  };
  return {
    queue,
    sent,
    sentProviderIds,
    settled,
    setBatch: (f: typeof batchImpl) => {
      batchImpl = f;
    },
    batch: (p: unknown[], _key: string | null) => batchImpl(p),
  };
}

const outboxStub = { enqueue: async () => {} };
const loggerStub = { info() {}, warn() {}, error() {} };

function makeWorker(h: ReturnType<typeof harness>) {
  return new EmailDeliveryWorker(
    h.queue as never,
    outboxStub as never,
    loggerStub as never,
    new NoOpInstrumentation(),
    { batchSend: h.batch },
  );
}

describe("EmailDeliveryWorker.drainOnce", () => {
  it("sends one batch request per template group", async () => {
    const h = harness([
      row({ id: "1" }),
      row({ id: "2" }),
      row({ id: "3", template: Option.some("delete_cancelled") }),
    ]);
    const requests: unknown[][] = [];
    h.setBatch(async (p) => {
      requests.push(p);
      return { data: p.map((_, i) => ({ id: `p${i}` })), error: null };
    });
    const worker = makeWorker(h);
    await worker.drainOnce();
    expect(requests).toHaveLength(2);
    expect(requests[0]).toHaveLength(2);
    expect(requests[1]).toHaveLength(1);
  });

  it("chunks a group larger than the provider cap", async () => {
    const many = Array.from({ length: 150 }, (_, i) => row({ id: String(i) }));
    const h = harness(many);
    const requests: unknown[][] = [];
    h.setBatch(async (p) => {
      requests.push(p);
      return { data: p.map((_, i) => ({ id: `p${i}` })), error: null };
    });
    const worker = makeWorker(h);
    await worker.drainOnce();
    expect(requests.map((r) => r.length)).toEqual([100, 50]);
  });

  it("marks only the entries reported in errors[] as failed, in one request", async () => {
    const h = harness([row({ id: "1" }), row({ id: "2", toAddress: "not-an-email" })]);
    let calls = 0;
    h.setBatch(async () => {
      calls++;
      return {
        data: [{ id: "p0" }],
        errors: [{ index: 1, message: "invalid recipient" }],
        error: null,
      };
    });
    const worker = makeWorker(h);
    await worker.drainOnce();
    expect(calls).toBe(1);
    expect(h.sent.flat()).toEqual(["1"]);
    expect(h.settled.map((s) => s.id)).toEqual(["2"]);
    expect(h.settled[0]?.nextAttemptAt.isNone()).toBe(true);
  });

  it("does not attach provider ids when data is not positionally aligned", async () => {
    const h = harness([row({ id: "1" }), row({ id: "2", toAddress: "bad" })]);
    h.setBatch(async () => ({
      data: [{ id: "p0" }],
      errors: [{ index: 1, message: "invalid" }],
      error: null,
    }));
    const worker = makeWorker(h);
    await worker.drainOnce();
    expect(h.sentProviderIds).toEqual([{}]);
  });

  it("reschedules the whole chunk on 429 without marking anything sent", async () => {
    const h = harness([row({ id: "1" }), row({ id: "2" })]);
    h.setBatch(async () => ({ data: null, error: { statusCode: 429, message: "rate limited" } }));
    const worker = makeWorker(h);
    await worker.drainOnce();
    expect(h.sent.flat()).toEqual([]);
    expect(h.settled.map((s) => s.id).sort()).toEqual(["1", "2"]);
    for (const s of h.settled) {
      expect(s.nextAttemptAt.isSome()).toBe(true);
    }
  });
});
