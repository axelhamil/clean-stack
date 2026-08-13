import { mock } from "bun:test";

// Expose the FULL export surface — bun's mock.module leaks across files.
// and/isNotNull/lt pass their column argument through so hasColumnName can inspect the filter.
mock.module("@packages/drizzle", () => ({
  db: {},
  eq: () => ({}),
  and: (...args: unknown[]) => ({ queryChunks: args }),
  or: (...args: unknown[]) => ({ queryChunks: args }),
  isNull: (col: unknown) => ({ queryChunks: [col] }),
  isNotNull: (col: unknown) => ({ queryChunks: [col] }),
  lt: (col: unknown) => ({ queryChunks: [col] }),
  lte: (col: unknown) => ({ queryChunks: [col] }),
  gt: (col: unknown) => ({ queryChunks: [col] }),
  gte: (col: unknown) => ({ queryChunks: [col] }),
  not: (col: unknown) => ({ queryChunks: [col] }),
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
  emailSchema: { emailMessage: { id: {}, status: {}, sentAt: {}, createdAt: {} } },
  notificationSchema: {
    notification: {
      dedupKey: { name: "dedup_key" },
      readAt: { name: "read_at" },
      createdAt: { name: "created_at" },
      id: {},
    },
  },
  apiTokenSchema: {
    apiToken: {
      id: {},
      userId: {},
      organizationId: {},
      name: {},
      scopes: {},
      tokenHmac: {},
      pepperVersion: {},
      tokenStart: {},
      lastUsedAt: {},
      expiresAt: {},
      revokedAt: {},
      revokedReason: {},
      createdAt: {},
      updatedAt: {},
    },
  },
}));

import { describe, expect, test } from "bun:test";

const { buildPurgeFilter } = await import("../sweep-notifications.route");

function hasColumnName(obj: unknown, target: string, seen = new WeakSet<object>()): boolean {
  if (!obj || typeof obj !== "object") return false;
  if (seen.has(obj as object)) return false;
  seen.add(obj as object);
  if ((obj as Record<string, unknown>).name === target) return true;
  return Object.values(obj as object).some((v) =>
    Array.isArray(v)
      ? v.some((i) => hasColumnName(i, target, seen))
      : hasColumnName(v, target, seen),
  );
}

describe("sweep-notifications", () => {
  test("le filtre de purge exige une notification lue", () => {
    const filter = buildPurgeFilter(new Date("2026-01-01T00:00:00Z"));
    expect(hasColumnName(filter, "read_at")).toBe(true);
  });
});
