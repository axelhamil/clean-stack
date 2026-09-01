/**
 * A shared `@packages/drizzle` stand-in for the sweep-route tests.
 *
 * It exists to avoid three files re-declaring the same fake `db` and schema shapes,
 * not to protect anything outside them: a module replacement is scoped to the test
 * file that declares it. Everything here is a stand-in with no SQL semantics — the
 * comparison helpers return markers, so a test that reads them is asserting on this
 * file, not on a query (see `apps/api/src/shared/CLAUDE.md`).
 */
export const drizzleMock = () => ({
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
  ilike: () => ({}),
  inArray: () => ({}),
  count: () => ({}),
  arrayContains: () => ({}),
  migrate: async () => {},
  getRateLimitDbClient: () => ({}),
  sql: Object.assign(
    (strings: TemplateStringsArray, ...values: unknown[]) => ({
      // Reconstructs the literal SQL text so a test can assert on `String(sql\`...\`)` —
      // e.g. confirming a `SET LOCAL` guard fired — without a real drizzle `sql` tag.
      toString: () =>
        strings.reduce(
          (acc, part, i) => `${acc}${part}${i < values.length ? String(values[i]) : ""}`,
          "",
        ),
    }),
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
  webhooksSchema: { webhookDelivery: {}, webhookEndpoint: {} },
  sweepSchema: {
    sweepLock: { label: {}, owner: {}, lockedAt: {}, lockedUntil: {} },
  },
  multiTenantSchema: {
    organization: { id: {} },
    member: {
      userId: { name: "user_id" },
      organizationId: { name: "organization_id" },
      role: { name: "role" },
    },
  },
  authSchema: {},
  ssoSchema: {},
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
});
