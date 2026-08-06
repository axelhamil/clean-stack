import { describe, expect, it, mock } from "bun:test";
import { Option, Result } from "@packages/ddd-kit";
import { EventTypes } from "@packages/events";
import { z } from "zod";
import type { IOutboxRepository } from "../../../shared/ports/outbox.port";
import { NoOpInstrumentation } from "../../../shared/services/noop-instrumentation";
import type { ApiTokenError, IApiTokenRepository } from "../application/ports/api-token.port";

// mock.module leaks: drizzle-outbox.service.test.ts stubs ALL @packages/events payload
// schemas with { safeParse: () => ({ success: true, data: {} }) }. When this file runs
// after it, OrgMemberRemovedPayload.safeParse always returns success with empty data —
// userId and organizationId become undefined and the "invalid payload" guard stops working.
// Re-mock with the real Zod schema so the handler validates correctly regardless of order.
const RealOrgMemberRemovedPayload = z.object({
  organizationId: z.string(),
  actorUserId: z.string(),
  userId: z.string(),
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
  OrgMemberRemovedPayload: RealOrgMemberRemovedPayload,
}));

// mock.module leaks: admin-action.service.test.ts and admin-impersonation.routes.test.ts
// mock shared/event-emitter to capture emitted events into a local array, without calling
// outbox.enqueue. If either runs before this file, emitEvent no longer calls outbox.enqueue
// and the "emits one event per token" assertion fails. Provide the real behaviour here.
mock.module("../../../shared/event-emitter", () => ({
  emitEvent: async (
    outbox: IOutboxRepository,
    eventType: string,
    aggregateType: string,
    aggregateId: string,
    payload: unknown,
    opts: { organizationId?: string | null } = {},
    tx?: unknown,
  ) => {
    const id = crypto.randomUUID();
    const event = { eventType, dateOccurred: new Date(), aggregateId, payload };
    await outbox.enqueue(
      [event],
      { source: "app/api", aggregateType, organizationId: opts.organizationId, id },
      tx as never,
    );
    return id;
  },
}));

const { revokeTokensOnMembershipLost } = await import(
  "../application/event-handlers/revoke-on-membership-lost"
);

function makeRepo(over: Partial<IApiTokenRepository> = {}): IApiTokenRepository {
  return {
    insert: mock(async () => Result.ok()),
    listByOwner: mock(async () => Result.ok([])),
    findByIdForOwner: mock(async () => Result.ok(Option.none())),
    findByHmac: mock(async () => Result.ok(Option.none())),
    revoke: mock(async () => Result.ok()),
    revokeAllForMembership: mock(async () => Result.ok<string[], ApiTokenError>([])),
    touchLastUsed: mock(async () => Result.ok(false)),
    rehash: mock(async () => Result.ok()),
    ...over,
  } as IApiTokenRepository;
}

function makeOutbox(): IOutboxRepository {
  return {
    enqueue: mock(async () => {}),
    findPendingBatch: mock(async () => []),
    markDispatched: mock(async () => {}),
    markFailed: mock(async () => {}),
  } as unknown as IOutboxRepository;
}

function makeDeps(repo: IApiTokenRepository, outbox = makeOutbox()) {
  return {
    IApiTokenRepository: repo,
    IOutboxRepository: outbox,
    ITransactionService: {
      run: async (cb: (tx: unknown) => Promise<void>) => cb({}),
    } as never,
    IInstrumentation: new NoOpInstrumentation(),
  };
}

function makeOrgMemberRemovedEvent(payload: object) {
  return {
    eventId: "evt-1",
    eventType: EventTypes.ORG_MEMBER_REMOVED,
    aggregateType: "organization",
    aggregateId: "org-1",
    payload,
    dateOccurred: new Date(),
    version: 1,
  };
}

describe("revokeTokensOnMembershipLost", () => {
  it("revokes tokens of the removed member in the target org and emits one event per token", async () => {
    const tokenIds = ["tok-a", "tok-b"];
    const repo = makeRepo({
      revokeAllForMembership: mock(async () => Result.ok<string[], ApiTokenError>(tokenIds)),
    });
    const outbox = makeOutbox();
    const handler = revokeTokensOnMembershipLost(makeDeps(repo, outbox));

    await handler.handle(
      makeOrgMemberRemovedEvent({
        organizationId: "org-1",
        userId: "user-1",
        actorUserId: "admin-1",
      }),
    );

    expect(repo.revokeAllForMembership).toHaveBeenCalledWith("user-1", "org-1", expect.anything());
    expect(outbox.enqueue).toHaveBeenCalledTimes(2);

    const calls = (outbox.enqueue as ReturnType<typeof mock>).mock.calls;
    for (const [events] of calls) {
      const event = events[0];
      expect(event.eventType).toBe(EventTypes.API_TOKEN_REVOKED);
      expect(event.payload.reason).toBe("membership_lost");
      expect(event.payload.actorUserId).toBe("admin-1");
      expect(event.payload.userId).toBe("user-1");
      expect(event.payload.organizationId).toBe("org-1");
      expect(tokenIds).toContain(event.payload.tokenId);
    }
  });

  it("does not emit any event when no tokens are revoked", async () => {
    const repo = makeRepo({
      revokeAllForMembership: mock(async () => Result.ok<string[], ApiTokenError>([])),
    });
    const outbox = makeOutbox();
    const handler = revokeTokensOnMembershipLost(makeDeps(repo, outbox));

    await handler.handle(
      makeOrgMemberRemovedEvent({
        organizationId: "org-1",
        userId: "user-1",
        actorUserId: "admin-1",
      }),
    );

    expect(outbox.enqueue).not.toHaveBeenCalled();
  });

  it("does not revoke tokens from a different organization", async () => {
    const repo = makeRepo({
      revokeAllForMembership: mock(async (_userId: string, organizationId: string) => {
        if (organizationId === "org-other") return Result.ok<string[], ApiTokenError>(["tok-x"]);
        return Result.ok<string[], ApiTokenError>([]);
      }),
    });
    const outbox = makeOutbox();
    const handler = revokeTokensOnMembershipLost(makeDeps(repo, outbox));

    await handler.handle(
      makeOrgMemberRemovedEvent({
        organizationId: "org-1",
        userId: "user-1",
        actorUserId: "admin-1",
      }),
    );

    expect(repo.revokeAllForMembership).toHaveBeenCalledWith("user-1", "org-1", expect.anything());
    expect(outbox.enqueue).not.toHaveBeenCalled();
  });

  it("does not propagate errors from the repository", async () => {
    const repo = makeRepo({
      revokeAllForMembership: mock(async () =>
        Result.fail<string[], ApiTokenError>({
          code: "API_TOKEN_PROVIDER_FAILURE",
          message: "db error",
        }),
      ),
    });
    const outbox = makeOutbox();
    const handler = revokeTokensOnMembershipLost(makeDeps(repo, outbox));

    await expect(
      handler.handle(
        makeOrgMemberRemovedEvent({
          organizationId: "org-1",
          userId: "user-1",
          actorUserId: "admin-1",
        }),
      ),
    ).resolves.toBeUndefined();

    expect(outbox.enqueue).not.toHaveBeenCalled();
  });

  it("silently ignores events with an invalid payload", async () => {
    const repo = makeRepo();
    const outbox = makeOutbox();
    const handler = revokeTokensOnMembershipLost(makeDeps(repo, outbox));

    await handler.handle(makeOrgMemberRemovedEvent({ garbage: true }));

    expect(repo.revokeAllForMembership).not.toHaveBeenCalled();
    expect(outbox.enqueue).not.toHaveBeenCalled();
  });
});
