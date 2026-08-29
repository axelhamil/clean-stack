import { beforeEach, describe, expect, it, mock, spyOn } from "bun:test";
import { Option } from "@packages/ddd-kit";
import * as sweepSchema from "../../../../../packages/drizzle/src/schema/sweep";

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
  sweepSchema,
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
  USER_MFA_BACKUP_CODES_REGENERATED: "user.mfa.backup_codes_regenerated",
  USER_MFA_BACKUP_CODE_USED: "user.mfa.backup_code_used",
  USER_PASSKEY_ADDED: "user.passkey.added",
  USER_PASSKEY_REMOVED: "user.passkey.removed",
  USER_ACCOUNT_LINKED: "user.account.linked",
  USER_ACCOUNT_UNLINKED: "user.account.unlinked",
  USER_DELETION_REQUESTED: "user.deletion.requested",
  USER_DELETION_CANCELLED: "user.deletion.cancelled",
  USER_DELETED: "user.deleted",
  USER_PROFILE_UPDATED: "user.profile.updated",
  USER_EMAIL_CHANGE_REQUESTED: "user.email.change_requested",
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
  WEBHOOK_TEST: "webhook.test",
  WEBHOOK_ENDPOINT_SECRET_ROTATED: "webhook.endpoint.secret_rotated",
  WEBHOOK_ENDPOINT_DISABLED: "webhook.endpoint.disabled",
  WEBHOOK_DELIVERY_EXHAUSTED: "webhook.delivery.exhausted",
  USER_POLICY_ACCEPTED: "user.policy.accepted",
  USER_COOKIE_CONSENT_GRANTED: "user.cookie_consent.granted",
  USER_COOKIE_CONSENT_WITHDRAWN: "user.cookie_consent.withdrawn",
  SECURITY_RATE_LIMIT_EXCEEDED: "security.rate_limit.exceeded",
  SECURITY_CSP_VIOLATION: "security.csp.violation",
  SECURITY_CSRF_REJECTED: "security.csrf.rejected",
  SECURITY_PASSWORD_BREACHED: "security.password.breached",
  SECURITY_SIGNUP_REJECTED: "security.signup.rejected",
  SECURITY_OPERATOR_AUDIT_ACCESSED: "security.operator.audit_accessed",
  BILLING_SUBSCRIPTION_CREATED: "billing.subscription.created",
  BILLING_SUBSCRIPTION_UPDATED: "billing.subscription.updated",
  BILLING_SUBSCRIPTION_CANCELLED: "billing.subscription.cancelled",
  BILLING_PAYMENT_FAILED: "billing.payment.failed",
  BILLING_QUOTA_EXCEEDED: "billing.quota.exceeded",
  ADMIN_IMPERSONATION_STARTED: "admin.impersonation.started",
  ADMIN_IMPERSONATION_STOPPED: "admin.impersonation.stopped",
  ADMIN_USER_BANNED: "admin.user.banned",
  ADMIN_USER_UNBANNED: "admin.user.unbanned",
  ADMIN_USER_ROLE_CHANGED: "admin.user.role_changed",
  ADMIN_USER_PASSWORD_RESET: "admin.user.password_reset",
  ADMIN_USER_SESSIONS_REVOKED: "admin.user.sessions_revoked",
  API_TOKEN_CREATED: "api_token.created",
  API_TOKEN_REVOKED: "api_token.revoked",
  API_TOKEN_USED: "api_token.used",
  EMAIL_DELIVERY_EXHAUSTED: "email.delivery.exhausted",
} as const;
const stubPayload = { safeParse: () => ({ success: true as const, data: {} as never }) };
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
  UserProfileUpdatedPayload: stubPayload,
  UserEmailChangeRequestedPayload: stubPayload,
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
  WebhookTestPayload: stubPayload,
  WebhookEndpointSecretRotatedPayload: stubPayload,
  WebhookEndpointDisabledPayload: stubPayload,
  WebhookDeliveryExhaustedPayload: stubPayload,
  UserPolicyAcceptedPayload: stubPayload,
  UserCookieConsentGrantedPayload: stubPayload,
  UserCookieConsentWithdrawnPayload: stubPayload,
  SecurityRateLimitExceededPayload: stubPayload,
  SecurityCspViolationPayload: stubPayload,
  SecurityCsrfRejectedPayload: stubPayload,
  SecurityPasswordBreachedPayload: stubPayload,
  SecuritySignupRejectedPayload: stubPayload,
  SecurityOperatorAuditAccessedPayload: stubPayload,
  BillingSubscriptionCreatedPayload: stubPayload,
  BillingSubscriptionUpdatedPayload: stubPayload,
  BillingSubscriptionCancelledPayload: stubPayload,
  BillingPaymentFailedPayload: stubPayload,
  BillingQuotaExceededPayload: stubPayload,
  AdminImpersonationStartedPayload: stubPayload,
  AdminImpersonationStoppedPayload: stubPayload,
  AdminUserBannedPayload: stubPayload,
  AdminUserUnbannedPayload: stubPayload,
  AdminUserRoleChangedPayload: stubPayload,
  AdminUserPasswordResetPayload: stubPayload,
  AdminUserSessionsRevokedPayload: stubPayload,
  ApiTokenCreatedPayload: stubPayload,
  ApiTokenRevokedPayload: stubPayload,
  ApiTokenUsedPayload: stubPayload,
  UserMfaBackupCodesRegeneratedPayload: stubPayload,
  UserMfaBackupCodeUsedPayload: stubPayload,
  EmailDeliveryExhaustedPayload: stubPayload,
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

    it("returns rows from the DB query with organizationId wrapped as Option", async () => {
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
      expect(result).toHaveLength(1);
      expect(result[0]?.organizationId.isNone()).toBe(true);
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
      await repo.markFailed("ev-1", "some error", Option.none(), fakeTx as never);
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
      await repo.markFailed("ev-1", "boom", Option.some(new Date()), fakeTx as never);
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
      await expect(repo.markFailed("ev-1", "err", Option.none(), fakeTx as never)).rejects.toThrow(
        "db fail",
      );
      expect(captureSpy).toHaveBeenCalled();
    });
  });
});
