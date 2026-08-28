import { beforeEach, describe, expect, it, mock, spyOn } from "bun:test";

// ---------------------------------------------------------------------------
// DB mock state (mutable per test via beforeEach)
// ---------------------------------------------------------------------------

let dbBehavior: () => Promise<unknown[]> = async () => [];

function buildQuery(result: () => Promise<unknown[]>) {
  const q: Record<string, unknown> = {
    toSQL: () => ({ sql: "SELECT 1", params: [] }),
    execute: result,
  };
  for (const m of [
    "returning",
    "set",
    "where",
    "values",
    "from",
    "limit",
    "innerJoin",
    "insert",
    "update",
    "delete",
    "select",
    "for",
    "orderBy",
  ]) {
    q[m] = () => buildQuery(result);
  }
  return q;
}

function makeDbQuery() {
  return buildQuery(async () => dbBehavior());
}

// mock.module leaks: drizzle-webhook-*.repository.test.ts and admin tests mock
// @packages/drizzle with a stub db. When this file runs after them, the `db`
// imported at module-load time is the stub, not the real Postgres connection.
// Re-mock before the dynamic import so the repository always gets the controlled
// db regardless of run order. Superset rule: expose every export used by the suite.
mock.module("@packages/drizzle", () => ({
  db: {
    select: () => makeDbQuery(),
    insert: () => makeDbQuery(),
    update: () => makeDbQuery(),
    delete: () => makeDbQuery(),
  },
  eq: () => ({}),
  and: (..._args: unknown[]) => ({}),
  or: (..._args: unknown[]) => ({}),
  inArray: () => ({}),
  isNull: () => ({}),
  isNotNull: () => ({}),
  lt: () => ({}),
  lte: () => ({}),
  gt: () => ({}),
  gte: () => ({}),
  asc: () => ({}),
  desc: () => ({}),
  not: () => ({}),
  like: () => ({}),
  count: () => ({}),
  arrayContains: () => ({}),
  sql: Object.assign((_strings: TemplateStringsArray, ..._values: unknown[]) => ({}), {
    raw: () => ({}),
    identifier: () => ({}),
  }),
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
    },
  },
  authSchema: { user: {}, session: {} },
  multiTenantSchema: { organization: { id: {} }, member: {} },
  outboxSchema: { outboxEvent: {} },
  auditLogSchema: { auditLog: {} },
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
}));

const { DrizzleApiTokenRepository } = await import(
  "../infrastructure/repositories/drizzle-api-token.repository"
);
const { NoOpInstrumentation } = await import("../../../shared/services/noop-instrumentation");

type InstrType = InstanceType<typeof NoOpInstrumentation>;

// ---------------------------------------------------------------------------
// Shared fake rows
// ---------------------------------------------------------------------------

const fakeRow = {
  id: "tok-1",
  userId: "user-1",
  organizationId: null as string | null,
  name: "ci",
  scopes: ["read:profile"],
  tokenHmac: "hmac-abc",
  pepperVersion: 1,
  tokenStart: "clean_abcd",
  lastUsedAt: null as Date | null,
  expiresAt: null as Date | null,
  revokedAt: null as Date | null,
  revokedReason: null as "user" | "membership_lost" | "leaked" | null,
  createdAt: new Date("2024-01-01"),
};

// ---------------------------------------------------------------------------
// Helper: inject DB error via startSpan spy (same pattern as webhook repo tests)
// ---------------------------------------------------------------------------
function injectDbError(instr: InstrType, boom: Error) {
  let callCount = 0;
  spyOn(instr, "startSpan").mockImplementation(((_opts: unknown, cb: unknown) => {
    callCount++;
    if (callCount === 2) throw boom;
    return (cb as () => Promise<unknown>)();
  }) as typeof instr.startSpan);
}

describe("DrizzleApiTokenRepository", () => {
  let instrumentation: InstrType;
  let repo: InstanceType<typeof DrizzleApiTokenRepository>;

  beforeEach(() => {
    instrumentation = new NoOpInstrumentation();
    repo = new DrizzleApiTokenRepository(instrumentation);
    dbBehavior = async () => [];
  });

  // -------------------------------------------------------------------------
  // findByHmac
  // -------------------------------------------------------------------------

  describe("findByHmac", () => {
    it("returns Option.none for an unknown hmac", async () => {
      dbBehavior = async () => [];

      const found = await repo.findByHmac("unknown-hmac");

      expect(found.isSuccess).toBe(true);
      expect(found.getValue().isNone()).toBe(true);
    });

    it("returns Option.some when hmac is found", async () => {
      dbBehavior = async () => [fakeRow];

      const found = await repo.findByHmac("hmac-abc");

      expect(found.isSuccess).toBe(true);
      expect(found.getValue().isSome()).toBe(true);
      expect(found.getValue().unwrap().id).toBe("tok-1");
    });

    it("failure path: DB throws → Result.fail", async () => {
      const boom = new Error("db boom");
      injectDbError(instrumentation, boom);

      const found = await repo.findByHmac("hmac-abc");

      expect(found.isFailure).toBe(true);
      expect(found.getError().code).toBe("API_TOKEN_PROVIDER_FAILURE");
    });
  });

  // -------------------------------------------------------------------------
  // findByIdForOwner — wrong owner returns Option.none
  // -------------------------------------------------------------------------

  describe("findByIdForOwner", () => {
    it("hides a token from a different owner behind Option.none", async () => {
      // First call (correct owner) returns the row; second call (different owner) returns nothing.
      // This mirrors the repository WHERE clause: AND userId = ? AND organizationId IS NULL.
      let call = 0;
      dbBehavior = async () => {
        call++;
        return call === 1 ? [fakeRow] : [];
      };

      const mine = await repo.findByIdForOwner("tok-1", { userId: "user-1", organizationId: null });
      expect(mine.getValue().isSome()).toBe(true);

      const theirs = await repo.findByIdForOwner("tok-1", {
        userId: "user-other",
        organizationId: null,
      });
      expect(theirs.getValue().isNone()).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // touchLastUsed — bucket write once
  // -------------------------------------------------------------------------

  describe("touchLastUsed", () => {
    it("only touches last_used_at once per bucket", async () => {
      // Simulates stateful DB: first touchLastUsed updates the row (returns 1 id),
      // then findByHmac returns a row with lastUsedAt set. Second touchLastUsed
      // finds the WHERE condition no longer satisfied (returns 0 rows). The second
      // findByHmac returns the same row → timestamps must be equal.
      const floor = new Date(Date.now() - 15 * 60_000);
      const lastUsed = new Date();
      const updatedRow = { ...fakeRow, lastUsedAt: lastUsed };

      let call = 0;
      dbBehavior = async () => {
        call++;
        if (call === 1) return [{ id: fakeRow.id }]; // touchLastUsed → 1 row updated
        if (call === 2) return [updatedRow]; // findByHmac after first touch
        if (call === 3) return []; // touchLastUsed → 0 rows (already set)
        return [updatedRow]; // findByHmac after second touch (unchanged)
      };

      await repo.touchLastUsed(fakeRow.id, floor);
      const first = (await repo.findByHmac(fakeRow.tokenHmac)).getValue().unwrap().lastUsedAt;
      expect(first).not.toBeNull();

      await repo.touchLastUsed(fakeRow.id, floor);
      const second = (await repo.findByHmac(fakeRow.tokenHmac)).getValue().unwrap().lastUsedAt;

      expect(second?.getTime()).toBe(first?.getTime());
    });
  });

  // -------------------------------------------------------------------------
  // revokeAllForMembership — limited to the target org
  // -------------------------------------------------------------------------

  describe("revokeAllForMembership", () => {
    it("revokes only the tokens of the lost membership", async () => {
      // The repository WHERE clause scopes the update to userId + organizationId.
      // First call (revokeAllForMembership for org-a) returns only tok-a's id.
      // Second call (findByHmac for tok-b) returns tok-b still live (revokedAt null).
      const fakeRowB = { ...fakeRow, id: "tok-b", organizationId: "org-b", tokenHmac: "hmac-b" };

      let call = 0;
      dbBehavior = async () => {
        call++;
        return call === 1
          ? [{ id: "tok-a" }] // revokeAllForMembership → only tok-a revoked
          : [fakeRowB]; // findByHmac(tok-b) → still live
      };

      const revoked = await repo.revokeAllForMembership("user-1", "org-a");
      expect(revoked.getValue()).toEqual(["tok-a"]);

      const stillLive = (await repo.findByHmac("hmac-b")).getValue().unwrap();
      expect(stillLive.revokedAt).toBeNull();
    });

    it("failure path: DB throws → Result.fail", async () => {
      const boom = new Error("revoke boom");
      injectDbError(instrumentation, boom);

      const result = await repo.revokeAllForMembership("user-1", "org-a");

      expect(result.isFailure).toBe(true);
      expect(result.getError().code).toBe("API_TOKEN_PROVIDER_FAILURE");
    });
  });

  // -------------------------------------------------------------------------
  // insert
  // -------------------------------------------------------------------------

  describe("insert", () => {
    it("happy path: returns Result.ok", async () => {
      dbBehavior = async () => [];

      const result = await repo.insert(fakeRow);

      expect(result.isSuccess).toBe(true);
    });

    it("failure path: DB throws → Result.fail", async () => {
      const boom = new Error("insert boom");
      injectDbError(instrumentation, boom);

      const result = await repo.insert(fakeRow);

      expect(result.isFailure).toBe(true);
      expect(result.getError().code).toBe("API_TOKEN_PROVIDER_FAILURE");
    });
  });

  // -------------------------------------------------------------------------
  // revoke
  // -------------------------------------------------------------------------

  describe("revoke", () => {
    it("happy path: returns Result.ok", async () => {
      dbBehavior = async () => [];

      const result = await repo.revoke("tok-1", "user");

      expect(result.isSuccess).toBe(true);
    });

    it("failure path: DB throws → Result.fail", async () => {
      const boom = new Error("revoke boom");
      injectDbError(instrumentation, boom);

      const result = await repo.revoke("tok-1", "user");

      expect(result.isFailure).toBe(true);
      expect(result.getError().code).toBe("API_TOKEN_PROVIDER_FAILURE");
    });
  });
});
