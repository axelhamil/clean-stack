import { describe, expect, it, mock } from "bun:test";
import { Result } from "@packages/ddd-kit";
import { EventTypes } from "@packages/events";
import { z } from "zod";

const capture = mock(() => {});
const sendTemplate = mock(async () => Result.ok());

// mock.module leaks: drizzle-outbox.service.test.ts stubs ALL @packages/events payload
// schemas with { safeParse: () => ({ success: true, data: {} }) }. When this file runs
// after it, AdminImpersonationStartedPayload.safeParse returns empty data and
// new Date(undefined).toLocaleString() throws — sendTemplate is never reached.
// Re-mock with the real schema so the handler validates correctly regardless of run order.
const ActorRef = z.object({ actorUserId: z.string() });
const UserRef = z.object({ userId: z.string() });
const RealAdminImpersonationStartedPayload = ActorRef.merge(UserRef).extend({
  reason: z.string().min(1),
  ticketRef: z.string().optional(),
  ip: z.string().nullable(),
  expiresAt: z.string(),
});

// Superset rule: expose ALL EventTypes values so files loaded after this mock
// (e.g. scanning.routes.ts) don't receive undefined for unrelated event types.
const FULL_EVENT_TYPES = {
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
  API_TOKEN_CREATED: "api_token.created",
  API_TOKEN_REVOKED: "api_token.revoked",
  API_TOKEN_USED: "api_token.used",
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
  EMAIL_DELIVERY_EXHAUSTED: "email.delivery.exhausted",
} as const;

mock.module("@packages/events", () => ({
  EventTypes: FULL_EVENT_TYPES,
  AdminImpersonationStartedPayload: RealAdminImpersonationStartedPayload,
}));

const { notifyImpersonatedUser } = await import(
  "../application/event-handlers/notify-impersonated-user"
);

const instrumentation = { capture, startSpan: mock(() => {}), addBreadcrumb: mock(() => {}) };

const BASE_EVENT = {
  eventType: EventTypes.ADMIN_IMPERSONATION_STARTED,
  dateOccurred: new Date("2026-08-05T08:00:00.000Z"),
  aggregateId: "u-2",
  payload: {
    actorUserId: "admin-1",
    userId: "u-2",
    reason: "ticket #42",
    ip: "1.2.3.4",
    expiresAt: "2026-08-05T10:00:00.000Z",
  },
};

describe("notifyImpersonatedUser", () => {
  it("envoie l'e-mail à l'utilisateur impersonné avec la raison et l'échéance", async () => {
    const handler = notifyImpersonatedUser({
      IEmailService: { sendTemplate },
      AdminQueryService: {
        getUser: mock(async () => ({
          isSuccess: true,
          isFailure: false,
          getValue: () => ({
            isNone: () => false,
            unwrap: () => ({ email: "target@example.com", name: "Ada" }),
          }),
        })),
      },
      IInstrumentation: instrumentation,
      supportUrl: "https://example.com/support",
    } as never);

    await handler.handle(BASE_EVENT);

    expect(sendTemplate).toHaveBeenCalledWith(
      "impersonation_started",
      "target@example.com",
      expect.objectContaining({
        userName: "Ada",
        reason: "ticket #42",
        supportUrl: "https://example.com/support",
      }),
    );
    expect(capture).not.toHaveBeenCalled();
  });

  it("ne tente pas d'envoyer l'e-mail si l'utilisateur est introuvable", async () => {
    sendTemplate.mockClear();

    const handler = notifyImpersonatedUser({
      IEmailService: { sendTemplate },
      AdminQueryService: {
        getUser: mock(async () => ({
          isSuccess: true,
          isFailure: false,
          getValue: () => ({
            isNone: () => true,
            unwrap: () => {
              throw new Error("none");
            },
          }),
        })),
      },
      IInstrumentation: instrumentation,
      supportUrl: "https://example.com/support",
    } as never);

    await handler.handle({
      ...BASE_EVENT,
      aggregateId: "u-99",
      payload: { ...BASE_EVENT.payload, userId: "u-99" },
    });

    expect(sendTemplate).not.toHaveBeenCalled();
  });

  it("ne tente pas d'envoyer l'e-mail si la lecture du compte échoue", async () => {
    sendTemplate.mockClear();

    const handler = notifyImpersonatedUser({
      IEmailService: { sendTemplate },
      AdminQueryService: {
        getUser: mock(async () => ({
          isSuccess: false,
          isFailure: true,
          getError: () => ({ code: "ADMIN_QUERY_PROVIDER_FAILURE", message: "db error" }),
        })),
      },
      IInstrumentation: instrumentation,
      supportUrl: "https://example.com/support",
    } as never);

    await handler.handle(BASE_EVENT);

    expect(sendTemplate).not.toHaveBeenCalled();
  });
});
