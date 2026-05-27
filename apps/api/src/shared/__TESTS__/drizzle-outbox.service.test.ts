import { beforeEach, describe, expect, it, mock, spyOn } from "bun:test";

// ── Mock @packages/drizzle ─────────────────────────────────────────────────
// Expose full export surface so parallel test files don't see missing exports.
const insertExecute = mock(async () => {});
const selectExecute = mock(async () => [] as unknown[]);
const updateExecute = mock(async () => {});

function makeQueryChain(executeMock: ReturnType<typeof mock>) {
  const chain: Record<string, unknown> = {};
  const leaf = {
    execute: executeMock,
    toSQL: () => ({ sql: "SELECT 1" }),
  };
  // Covers: insert().values() / update().set().where() / select().from().where()...limit()...for()
  const proxy: unknown = new Proxy(leaf, {
    get(target, prop) {
      if (prop === "execute" || prop === "toSQL") return Reflect.get(target, prop);
      return () => proxy;
    },
  });
  chain.proxy = proxy;
  return proxy;
}

const fakeDb = {
  insert: () => makeQueryChain(insertExecute),
  update: () => makeQueryChain(updateExecute),
  select: () => makeQueryChain(selectExecute),
};

const fakeTx = {
  insert: () => makeQueryChain(insertExecute),
  update: () => makeQueryChain(updateExecute),
  select: () => makeQueryChain(selectExecute),
};

mock.module("@packages/drizzle", () => ({
  db: fakeDb,
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
  desc: () => ({}),
  like: () => ({}),
  inArray: () => ({}),
  count: () => ({}),
  arrayContains: () => ({}),
  sql: Object.assign((_strings: TemplateStringsArray, ..._values: unknown[]) => ({}), {
    raw: () => ({}),
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
  webhooksSchema: { webhookDelivery: {} },
  multiTenantSchema: {},
  authSchema: {},
  schema: {},
  trackEventsOnSuccess: () => {},
  TransactionService: class {},
}));

// ── Mock @packages/events ──────────────────────────────────────────────────
// Expose the FULL export surface — bun's mock.module leaks across files.
const EventTypesMock = {
  USER_CREATED: "user.created",
  USER_SIGNED_IN: "user.signed_in",
  USER_SIGNED_OUT: "user.signed_out",
  USER_EMAIL_VERIFIED: "user.email_verified",
  USER_PASSWORD_RESET_REQUESTED: "user.password_reset.requested",
  USER_PASSWORD_CHANGED: "user.password_changed",
  USER_MAGIC_LINK_REQUESTED: "user.magic_link.requested",
  USER_MFA_ENABLED: "user.mfa.enabled",
  USER_MFA_DISABLED: "user.mfa.disabled",
  USER_PASSKEY_ADDED: "user.passkey.added",
  USER_PASSKEY_REMOVED: "user.passkey.removed",
  USER_ACCOUNT_LINKED: "user.account.linked",
  USER_ACCOUNT_UNLINKED: "user.account.unlinked",
  USER_DELETION_REQUESTED: "user.deletion.requested",
  USER_DELETION_CANCELLED: "user.deletion.cancelled",
  USER_DELETED: "user.deleted",
  USER_EXPORT_REQUESTED: "user.export.requested",
  USER_EXPORT_COMPLETED: "user.export.completed",
  ORG_CREATED: "org.created",
  ORG_UPDATED: "org.updated",
  ORG_DELETED: "org.deleted",
  ORG_MEMBER_INVITED: "org.member.invited",
  ORG_MEMBER_JOINED: "org.member.joined",
  ORG_INVITATION_CANCELLED: "org.invitation.cancelled",
  ORG_MEMBER_REMOVED: "org.member.removed",
  ORG_MEMBER_ROLE_CHANGED: "org.member.role_changed",
  UPLOAD_REQUESTED: "upload.requested",
  UPLOAD_CONFIRMED: "upload.confirmed",
  UPLOAD_DELETED: "upload.deleted",
  WEBHOOK_ENDPOINT_CREATED: "webhook.endpoint.created",
  WEBHOOK_ENDPOINT_UPDATED: "webhook.endpoint.updated",
  WEBHOOK_ENDPOINT_DELETED: "webhook.endpoint.deleted",
} as const;
const stubPayload = { safeParse: () => ({ success: true }) };
mock.module("@packages/events", () => ({
  EventTypes: EventTypesMock,
  ALL_EVENT_TYPES: Object.values(EventTypesMock),
  isKnownEventType: (v: string) => Object.values(EventTypesMock).includes(v as never),
  RETENTION_MAP: Object.fromEntries(Object.values(EventTypesMock).map((t) => [t, "compliance"])),
  retentionFor: () => "compliance",
  PayloadByEventType: Object.fromEntries(
    Object.values(EventTypesMock).map((t) => [t, stubPayload]),
  ),
  // Payload schemas (stubs — type-level only in this test)
  UserCreatedPayload: stubPayload,
  UserSignedInPayload: stubPayload,
  UserSignedOutPayload: stubPayload,
  UserEmailVerifiedPayload: stubPayload,
  UserPasswordResetRequestedPayload: stubPayload,
  UserPasswordChangedPayload: stubPayload,
  UserMagicLinkRequestedPayload: stubPayload,
  UserMfaEnabledPayload: stubPayload,
  UserMfaDisabledPayload: stubPayload,
  UserPasskeyAddedPayload: stubPayload,
  UserPasskeyRemovedPayload: stubPayload,
  UserAccountLinkedPayload: stubPayload,
  UserAccountUnlinkedPayload: stubPayload,
  UserDeletionRequestedPayload: stubPayload,
  UserDeletionCancelledPayload: stubPayload,
  UserDeletedPayload: stubPayload,
  UserExportRequestedPayload: stubPayload,
  UserExportCompletedPayload: stubPayload,
  OrgCreatedPayload: stubPayload,
  OrgUpdatedPayload: stubPayload,
  OrgDeletedPayload: stubPayload,
  OrgMemberInvitedPayload: stubPayload,
  OrgMemberJoinedPayload: stubPayload,
  OrgInvitationCancelledPayload: stubPayload,
  OrgMemberRemovedPayload: stubPayload,
  OrgMemberRoleChangedPayload: stubPayload,
  UploadRequestedPayload: stubPayload,
  UploadConfirmedPayload: stubPayload,
  UploadDeletedPayload: stubPayload,
  WebhookEndpointCreatedPayload: stubPayload,
  WebhookEndpointUpdatedPayload: stubPayload,
  WebhookEndpointDeletedPayload: stubPayload,
}));

// ── Imports after mocks ────────────────────────────────────────────────────
const { DrizzleOutboxRepository } = await import("../services/drizzle-outbox.service");
const { NoOpInstrumentation } = await import("../services/noop-instrumentation");

// ── Helpers ────────────────────────────────────────────────────────────────
function makeEvent(
  overrides: Partial<{
    eventType: string;
    aggregateId: string;
    payload: unknown;
  }> = {},
) {
  return {
    eventType: overrides.eventType ?? "user.created",
    aggregateId: overrides.aggregateId ?? "agg-1",
    payload: overrides.payload ?? { userId: "u1", email: "u@test.com", name: "U" },
    dateOccurred: new Date(),
  };
}

const defaultScope = { source: "api", organizationId: "org-1", aggregateType: "User" };

// ── Tests ──────────────────────────────────────────────────────────────────
describe("DrizzleOutboxRepository", () => {
  beforeEach(() => {
    insertExecute.mockReset();
    insertExecute.mockResolvedValue(undefined);
    selectExecute.mockReset();
    selectExecute.mockResolvedValue([]);
    updateExecute.mockReset();
    updateExecute.mockResolvedValue(undefined);
  });

  describe("enqueue", () => {
    it("calls outer startSpan with name 'DrizzleOutboxRepository > enqueue'", async () => {
      const instr = new NoOpInstrumentation();
      const spy = spyOn(instr, "startSpan").mockImplementation(((_opts, cb) =>
        (cb as () => unknown)()) as typeof instr.startSpan);
      const repo = new DrizzleOutboxRepository(instr);
      await repo.enqueue([makeEvent()], defaultScope);
      expect(spy).toHaveBeenCalledWith(
        expect.objectContaining({ name: "DrizzleOutboxRepository > enqueue" }),
        expect.any(Function),
      );
    });

    it("calls inner startSpan with op: 'db.query'", async () => {
      const instr = new NoOpInstrumentation();
      const spy = spyOn(instr, "startSpan").mockImplementation(((_opts, cb) =>
        (cb as () => unknown)()) as typeof instr.startSpan);
      const repo = new DrizzleOutboxRepository(instr);
      await repo.enqueue([makeEvent()], defaultScope);
      const innerCall = spy.mock.calls.find((c) => c[0]?.op === "db.query");
      expect(innerCall).toBeDefined();
    });

    it("no-ops when events array is empty", async () => {
      const repo = new DrizzleOutboxRepository(new NoOpInstrumentation());
      await expect(repo.enqueue([], defaultScope)).resolves.toBeUndefined();
      expect(insertExecute).not.toHaveBeenCalled();
    });

    it("calls instrumentation.capture and rethrows on DB error", async () => {
      const instr = new NoOpInstrumentation();
      const captureSpy = spyOn(instr, "capture");
      // make the inner span throw by patching startSpan to execute the callback but
      // having insertExecute throw on second call (inner span callback)
      let callCount = 0;
      spyOn(instr, "startSpan").mockImplementation(((_opts, cb) => {
        callCount++;
        if (callCount === 2) {
          throw new Error("db fail");
        }
        return (cb as () => unknown)();
      }) as typeof instr.startSpan);
      const repo = new DrizzleOutboxRepository(instr);
      await expect(repo.enqueue([makeEvent()], defaultScope)).rejects.toThrow("db fail");
      expect(captureSpy).toHaveBeenCalled();
    });
  });

  describe("findPendingBatch", () => {
    it("calls outer startSpan with name 'DrizzleOutboxRepository > findPendingBatch'", async () => {
      const instr = new NoOpInstrumentation();
      const spy = spyOn(instr, "startSpan").mockImplementation(((_opts, cb) =>
        (cb as () => unknown)()) as typeof instr.startSpan);
      const repo = new DrizzleOutboxRepository(instr);
      await repo.findPendingBatch(10, fakeTx as never);
      expect(spy).toHaveBeenCalledWith(
        expect.objectContaining({ name: "DrizzleOutboxRepository > findPendingBatch" }),
        expect.any(Function),
      );
    });

    it("returns rows from the DB query", async () => {
      const row = {
        id: "ev-1",
        eventType: "user.created",
        aggregateId: "a",
        aggregateType: "User",
        organizationId: null,
        payload: {},
        metadata: {},
        occurredAt: new Date(),
        attempts: 0,
      };
      selectExecute.mockResolvedValueOnce([row]);
      const repo = new DrizzleOutboxRepository(new NoOpInstrumentation());
      const result = await repo.findPendingBatch(10, fakeTx as never);
      expect(result as unknown[]).toEqual([row]);
    });

    it("calls instrumentation.capture and rethrows on DB error", async () => {
      const instr = new NoOpInstrumentation();
      const captureSpy = spyOn(instr, "capture");
      let callCount = 0;
      spyOn(instr, "startSpan").mockImplementation(((_opts, cb) => {
        callCount++;
        if (callCount === 2) throw new Error("db fail");
        return (cb as () => unknown)();
      }) as typeof instr.startSpan);
      const repo = new DrizzleOutboxRepository(instr);
      await expect(repo.findPendingBatch(10, fakeTx as never)).rejects.toThrow("db fail");
      expect(captureSpy).toHaveBeenCalled();
    });
  });

  describe("markDispatched", () => {
    it("calls outer startSpan with name 'DrizzleOutboxRepository > markDispatched'", async () => {
      const instr = new NoOpInstrumentation();
      const spy = spyOn(instr, "startSpan").mockImplementation(((_opts, cb) =>
        (cb as () => unknown)()) as typeof instr.startSpan);
      const repo = new DrizzleOutboxRepository(instr);
      await repo.markDispatched("ev-1", fakeTx as never);
      expect(spy).toHaveBeenCalledWith(
        expect.objectContaining({ name: "DrizzleOutboxRepository > markDispatched" }),
        expect.any(Function),
      );
    });

    it("calls inner startSpan with op: 'db.query'", async () => {
      const instr = new NoOpInstrumentation();
      const spy = spyOn(instr, "startSpan").mockImplementation(((_opts, cb) =>
        (cb as () => unknown)()) as typeof instr.startSpan);
      const repo = new DrizzleOutboxRepository(instr);
      await repo.markDispatched("ev-1", fakeTx as never);
      const innerCall = spy.mock.calls.find((c) => c[0]?.op === "db.query");
      expect(innerCall).toBeDefined();
    });

    it("calls instrumentation.capture and rethrows on DB error", async () => {
      const instr = new NoOpInstrumentation();
      const captureSpy = spyOn(instr, "capture");
      let callCount = 0;
      spyOn(instr, "startSpan").mockImplementation(((_opts, cb) => {
        callCount++;
        if (callCount === 2) throw new Error("db fail");
        return (cb as () => unknown)();
      }) as typeof instr.startSpan);
      const repo = new DrizzleOutboxRepository(instr);
      await expect(repo.markDispatched("ev-1", fakeTx as never)).rejects.toThrow("db fail");
      expect(captureSpy).toHaveBeenCalled();
    });
  });

  describe("markFailed", () => {
    it("calls outer startSpan with name 'DrizzleOutboxRepository > markFailed'", async () => {
      const instr = new NoOpInstrumentation();
      const spy = spyOn(instr, "startSpan").mockImplementation(((_opts, cb) =>
        (cb as () => unknown)()) as typeof instr.startSpan);
      const repo = new DrizzleOutboxRepository(instr);
      await repo.markFailed("ev-1", "some error", null, fakeTx as never);
      expect(spy).toHaveBeenCalledWith(
        expect.objectContaining({ name: "DrizzleOutboxRepository > markFailed" }),
        expect.any(Function),
      );
    });

    it("calls inner startSpan with op: 'db.query'", async () => {
      const instr = new NoOpInstrumentation();
      const spy = spyOn(instr, "startSpan").mockImplementation(((_opts, cb) =>
        (cb as () => unknown)()) as typeof instr.startSpan);
      const repo = new DrizzleOutboxRepository(instr);
      await repo.markFailed("ev-1", "boom", new Date(), fakeTx as never);
      const innerCall = spy.mock.calls.find((c) => c[0]?.op === "db.query");
      expect(innerCall).toBeDefined();
    });

    it("calls instrumentation.capture and rethrows on DB error", async () => {
      const instr = new NoOpInstrumentation();
      const captureSpy = spyOn(instr, "capture");
      let callCount = 0;
      spyOn(instr, "startSpan").mockImplementation(((_opts, cb) => {
        callCount++;
        if (callCount === 2) throw new Error("db fail");
        return (cb as () => unknown)();
      }) as typeof instr.startSpan);
      const repo = new DrizzleOutboxRepository(instr);
      await expect(repo.markFailed("ev-1", "err", null, fakeTx as never)).rejects.toThrow(
        "db fail",
      );
      expect(captureSpy).toHaveBeenCalled();
    });
  });
});
