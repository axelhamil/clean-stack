import { LOCALES } from "@packages/i18n";
import { z } from "zod";
import { EventTypes } from "./event-types";

const UserRef = z.object({ userId: z.string() });
const OrgRef = z.object({ organizationId: z.string() });
const Email = z.email();

export const UserCreatedPayload = UserRef.extend({
  email: Email,
  name: z.string(),
});
export type UserCreatedPayload = z.infer<typeof UserCreatedPayload>;

export const UserSignedInPayload = UserRef.extend({
  sessionId: z.string(),
  ipAddress: z.string().optional(),
  userAgent: z.string().optional(),
});
export type UserSignedInPayload = z.infer<typeof UserSignedInPayload>;

export const UserSignedOutPayload = UserRef.extend({
  sessionId: z.string(),
});
export type UserSignedOutPayload = z.infer<typeof UserSignedOutPayload>;

export const UserEmailVerifiedPayload = UserRef.extend({
  email: Email,
});
export type UserEmailVerifiedPayload = z.infer<typeof UserEmailVerifiedPayload>;

export const UserPasswordResetRequestedPayload = UserRef.extend({
  email: Email,
});
export type UserPasswordResetRequestedPayload = z.infer<typeof UserPasswordResetRequestedPayload>;

export const UserPasswordChangedPayload = UserRef;
export type UserPasswordChangedPayload = z.infer<typeof UserPasswordChangedPayload>;

export const UserMagicLinkRequestedPayload = z.object({
  email: Email,
});
export type UserMagicLinkRequestedPayload = z.infer<typeof UserMagicLinkRequestedPayload>;

export const UserMfaEnabledPayload = UserRef;
export type UserMfaEnabledPayload = z.infer<typeof UserMfaEnabledPayload>;

export const UserMfaDisabledPayload = UserRef;
export type UserMfaDisabledPayload = z.infer<typeof UserMfaDisabledPayload>;

export const UserMfaBackupCodesRegeneratedPayload = UserRef;
export type UserMfaBackupCodesRegeneratedPayload = z.infer<
  typeof UserMfaBackupCodesRegeneratedPayload
>;

export const UserMfaBackupCodeUsedPayload = UserRef.extend({
  email: Email,
});
export type UserMfaBackupCodeUsedPayload = z.infer<typeof UserMfaBackupCodeUsedPayload>;

export const UserPasskeyAddedPayload = UserRef.extend({
  passkeyId: z.string(),
  deviceType: z.string().optional(),
});
export type UserPasskeyAddedPayload = z.infer<typeof UserPasskeyAddedPayload>;

export const UserPasskeyRemovedPayload = UserRef.extend({
  passkeyId: z.string(),
});
export type UserPasskeyRemovedPayload = z.infer<typeof UserPasskeyRemovedPayload>;

export const UserAccountLinkedPayload = UserRef.extend({
  providerId: z.string(),
  accountId: z.string(),
});
export type UserAccountLinkedPayload = z.infer<typeof UserAccountLinkedPayload>;

export const UserAccountUnlinkedPayload = UserRef.extend({
  providerId: z.string(),
  accountId: z.string(),
});
export type UserAccountUnlinkedPayload = z.infer<typeof UserAccountUnlinkedPayload>;

export const UserDeletionRequestedPayload = UserRef.extend({
  pendingDeletionUntil: z.coerce.date(),
});
export type UserDeletionRequestedPayload = z.infer<typeof UserDeletionRequestedPayload>;

export const UserDeletionCancelledPayload = UserRef;
export type UserDeletionCancelledPayload = z.infer<typeof UserDeletionCancelledPayload>;

export const UserDeletedPayload = UserRef.extend({
  deletedAt: z.coerce.date(),
});
export type UserDeletedPayload = z.infer<typeof UserDeletedPayload>;

export const UserProfileUpdatedPayload = UserRef.extend({
  changes: z.record(z.string(), z.unknown()),
});
export type UserProfileUpdatedPayload = z.infer<typeof UserProfileUpdatedPayload>;

export const UserEmailChangeRequestedPayload = UserRef.extend({
  newEmail: z.email(),
});
export type UserEmailChangeRequestedPayload = z.infer<typeof UserEmailChangeRequestedPayload>;

export const UserExportRequestedPayload = UserRef;
export type UserExportRequestedPayload = z.infer<typeof UserExportRequestedPayload>;

export const UserExportCompletedPayload = UserRef.extend({
  storageKey: z.string(),
  expiresAt: z.coerce.date(),
});
export type UserExportCompletedPayload = z.infer<typeof UserExportCompletedPayload>;

// Subject and actor are the same person: the route carries `denyImpersonated`,
// so no admin can trigger this on someone else's behalf. `userId` alone
// therefore satisfies §7 without a separate `actorUserId`.
export const UserLocaleChangedPayload = UserRef.extend({
  locale: z.enum(LOCALES),
  previousLocale: z.enum(LOCALES).nullable(),
});
export type UserLocaleChangedPayload = z.infer<typeof UserLocaleChangedPayload>;

export const OrgCreatedPayload = OrgRef.extend({
  ownerUserId: z.string(),
  slug: z.string(),
  name: z.string(),
});
export type OrgCreatedPayload = z.infer<typeof OrgCreatedPayload>;

export const OrgUpdatedPayload = OrgRef.extend({
  actorUserId: z.string(),
  changes: z.record(z.string(), z.unknown()),
});
export type OrgUpdatedPayload = z.infer<typeof OrgUpdatedPayload>;

export const OrgDeletedPayload = OrgRef.extend({
  actorUserId: z.string().nullable(),
});
export type OrgDeletedPayload = z.infer<typeof OrgDeletedPayload>;

export const OrgMemberInvitedPayload = OrgRef.extend({
  invitationId: z.string(),
  email: Email,
  role: z.string(),
  inviterUserId: z.string(),
});
export type OrgMemberInvitedPayload = z.infer<typeof OrgMemberInvitedPayload>;

export const OrgMemberJoinedPayload = OrgRef.extend({
  userId: z.string(),
  role: z.string(),
  actorUserId: z.string().optional(),
});
export type OrgMemberJoinedPayload = z.infer<typeof OrgMemberJoinedPayload>;

export const OrgInvitationCancelledPayload = OrgRef.extend({
  actorUserId: z.string(),
  invitationId: z.string(),
});
export type OrgInvitationCancelledPayload = z.infer<typeof OrgInvitationCancelledPayload>;

export const OrgMemberRemovedPayload = OrgRef.extend({
  actorUserId: z.string(),
  userId: z.string(),
});
export type OrgMemberRemovedPayload = z.infer<typeof OrgMemberRemovedPayload>;

export const OrgMemberRoleChangedPayload = OrgRef.extend({
  actorUserId: z.string(),
  userId: z.string(),
  previousRole: z.string(),
  newRole: z.string(),
});
export type OrgMemberRoleChangedPayload = z.infer<typeof OrgMemberRoleChangedPayload>;

export const UploadRequestedPayload = z.object({
  userId: z.string(),
  key: z.string(),
  contentType: z.string(),
  size: z.number().int().nonnegative(),
});
export type UploadRequestedPayload = z.infer<typeof UploadRequestedPayload>;

export const UploadConfirmedPayload = z.object({
  userId: z.string(),
  key: z.string(),
  size: z.number().int().nonnegative(),
  contentType: z.string(),
});
export type UploadConfirmedPayload = z.infer<typeof UploadConfirmedPayload>;

export const UploadDeletedPayload = z.object({
  userId: z.string(),
  key: z.string(),
});
export type UploadDeletedPayload = z.infer<typeof UploadDeletedPayload>;

export const WebhookEndpointCreatedPayload = OrgRef.extend({
  endpointId: z.string(),
  actorUserId: z.string(),
  url: z.url(),
  eventTypes: z.array(z.string()),
  enabled: z.boolean(),
});
export type WebhookEndpointCreatedPayload = z.infer<typeof WebhookEndpointCreatedPayload>;

export const WebhookEndpointUpdatedPayload = OrgRef.extend({
  endpointId: z.string(),
  actorUserId: z.string(),
  changes: z.record(z.string(), z.unknown()),
});
export type WebhookEndpointUpdatedPayload = z.infer<typeof WebhookEndpointUpdatedPayload>;

export const WebhookEndpointDeletedPayload = OrgRef.extend({
  endpointId: z.string(),
  actorUserId: z.string(),
});
export type WebhookEndpointDeletedPayload = z.infer<typeof WebhookEndpointDeletedPayload>;

export const WebhookTestPayload = OrgRef.extend({
  endpointId: z.string(),
  actorUserId: z.string(),
});
export type WebhookTestPayload = z.infer<typeof WebhookTestPayload>;

export const WebhookEndpointSecretRotatedPayload = OrgRef.extend({
  endpointId: z.string(),
  actorUserId: z.string(),
});
export type WebhookEndpointSecretRotatedPayload = z.infer<
  typeof WebhookEndpointSecretRotatedPayload
>;

export const WebhookEndpointDisabledPayload = OrgRef.extend({
  endpointId: z.string(),
  actorUserId: z.string().nullable(),
  reason: z.enum(["delivery_failures"]),
  consecutiveFailures: z.number().int().nonnegative(),
});
export type WebhookEndpointDisabledPayload = z.infer<typeof WebhookEndpointDisabledPayload>;

export const WebhookDeliveryExhaustedPayload = OrgRef.extend({
  endpointId: z.string(),
  deliveryId: z.string(),
  eventType: z.string(),
  attempts: z.number().int().nonnegative(),
  actorUserId: z.string().nullable(),
});
export type WebhookDeliveryExhaustedPayload = z.infer<typeof WebhookDeliveryExhaustedPayload>;

export const EmailDeliveryExhaustedPayload = z.object({
  messageId: z.string(),
  template: z.string().nullable(),
  toHash: z.string(),
  attempts: z.number().int().nonnegative(),
  lastError: z.string(),
  actorUserId: z.string().nullable(),
});
export type EmailDeliveryExhaustedPayload = z.infer<typeof EmailDeliveryExhaustedPayload>;

export const UserPolicyAcceptedPayload = UserRef.extend({
  policyType: z.string(),
  policyVersion: z.string(),
  ipAddress: z.string().optional(),
});
export type UserPolicyAcceptedPayload = z.infer<typeof UserPolicyAcceptedPayload>;

// userId is optional: guest consents have no userId, only subjectId (anonymous cookie-based id).
// extractActor will fall back to system/anonymous for guests — accepted per §7 (no identified user).
export const UserCookieConsentGrantedPayload = z.object({
  userId: z.string().optional(),
  subjectId: z.string(),
  categories: z.array(z.string()),
  policyVersion: z.string(),
  ipAddress: z.string().optional(),
  userAgent: z.string().optional(),
});
export type UserCookieConsentGrantedPayload = z.infer<typeof UserCookieConsentGrantedPayload>;

export const UserCookieConsentWithdrawnPayload = z.object({
  userId: z.string().optional(),
  subjectId: z.string(),
  categories: z.array(z.string()),
  policyVersion: z.string(),
});
export type UserCookieConsentWithdrawnPayload = z.infer<typeof UserCookieConsentWithdrawnPayload>;

export const SecurityRateLimitExceededPayload = z.object({
  actorUserId: z.string().nullable(),
  ip: z.string().max(45),
  policyName: z.string().max(64),
  path: z.string().max(512),
  method: z.string().max(16),
});
export type SecurityRateLimitExceededPayload = z.infer<typeof SecurityRateLimitExceededPayload>;

export const SecurityCspViolationPayload = z.object({
  // Always null: CSP reports are browser-sent before any authenticated session — no known actor.
  actorUserId: z.string().nullable(),
  ip: z.string().max(45),
  documentUri: z.string().max(2048),
  blockedUri: z.string().max(2048),
  violatedDirective: z.string().max(128),
  effectiveDirective: z.string().max(64),
  disposition: z.enum(["enforce", "report"]),
  sourceFile: z.string().max(2048).optional(),
  sample: z.string().max(100).optional(),
  lineNumber: z.number().int().min(0).optional(),
  columnNumber: z.number().int().min(0).optional(),
});
export type SecurityCspViolationPayload = z.infer<typeof SecurityCspViolationPayload>;

export const SecurityCsrfRejectedPayload = z.object({
  actorUserId: z.string().nullable(),
  ip: z.string().max(45),
  method: z.string().max(16),
  path: z.string().max(512),
  origin: z.string().max(2048).nullable(),
  reason: z.enum(["missing_origin", "origin_mismatch"]),
});
export type SecurityCsrfRejectedPayload = z.infer<typeof SecurityCsrfRejectedPayload>;

export const SecurityPasswordBreachedPayload = z.object({
  actorUserId: z.string().nullable(),
  email: z.string().max(254).nullable(),
  ip: z.string().max(45).nullable(),
  path: z.string().max(512),
});
export type SecurityPasswordBreachedPayload = z.infer<typeof SecurityPasswordBreachedPayload>;

export const SecuritySignupRejectedPayload = z.object({
  actorUserId: z.string().nullable(),
  email: z.string().max(254),
  ip: z.string().max(45).nullable(),
  reason: z.enum(["disposable_email"]),
});
export type SecuritySignupRejectedPayload = z.infer<typeof SecuritySignupRejectedPayload>;

export const SecurityOperatorAuditAccessedPayload = z.object({
  actorUserId: z.string(),
  ip: z.string().max(45).nullable(),
  filters: z
    .object({
      actorId: z.string().optional(),
      actionPrefix: z.string().optional(),
      organizationId: z.string().optional(),
      occurredFrom: z.string().optional(),
      occurredTo: z.string().optional(),
    })
    .optional(),
});
export type SecurityOperatorAuditAccessedPayload = z.infer<
  typeof SecurityOperatorAuditAccessedPayload
>;

export const BillingSubscriptionCreatedPayload = OrgRef.extend({
  subscriptionId: z.string(),
  tier: z.string(),
  status: z.string(),
  actorUserId: z.string().nullable(),
  currentPeriodEnd: z.coerce.date().nullable(),
});
export type BillingSubscriptionCreatedPayload = z.infer<typeof BillingSubscriptionCreatedPayload>;

export const BillingSubscriptionUpdatedPayload = BillingSubscriptionCreatedPayload;
export type BillingSubscriptionUpdatedPayload = z.infer<typeof BillingSubscriptionUpdatedPayload>;

export const BillingSubscriptionCancelledPayload = OrgRef.extend({
  subscriptionId: z.string(),
  tier: z.string(),
  status: z.string(),
  actorUserId: z.string().nullable(),
});
export type BillingSubscriptionCancelledPayload = z.infer<
  typeof BillingSubscriptionCancelledPayload
>;

export const BillingPaymentFailedPayload = OrgRef.extend({
  subscriptionId: z.string(),
  invoiceId: z.string(),
  actorUserId: z.string().nullable(),
});
export type BillingPaymentFailedPayload = z.infer<typeof BillingPaymentFailedPayload>;

export const BillingQuotaExceededPayload = OrgRef.extend({
  resource: z.string(),
  limit: z.number().int().nonnegative(),
  attempted: z.number().int().nonnegative(),
  tier: z.string(),
  actorUserId: z.string(),
});
export type BillingQuotaExceededPayload = z.infer<typeof BillingQuotaExceededPayload>;

const ActorRef = z.object({ actorUserId: z.string() });

export const AdminImpersonationStartedPayload = ActorRef.merge(UserRef).extend({
  reason: z.string().min(1),
  ticketRef: z.string().optional(),
  ip: z.string().nullable(),
  expiresAt: z.string(),
});
export type AdminImpersonationStartedPayload = z.infer<typeof AdminImpersonationStartedPayload>;

export const AdminImpersonationStoppedPayload = ActorRef.merge(UserRef).extend({
  durationMs: z.number().int().nonnegative(),
});
export type AdminImpersonationStoppedPayload = z.infer<typeof AdminImpersonationStoppedPayload>;

export const AdminUserBannedPayload = ActorRef.merge(UserRef).extend({
  reason: z.string().min(1),
  expiresAt: z.string().nullable(),
});
export type AdminUserBannedPayload = z.infer<typeof AdminUserBannedPayload>;

export const AdminUserUnbannedPayload = ActorRef.merge(UserRef);
export type AdminUserUnbannedPayload = z.infer<typeof AdminUserUnbannedPayload>;

export const AdminUserRoleChangedPayload = ActorRef.merge(UserRef).extend({
  from: z.string().nullable(),
  to: z.string(),
});
export type AdminUserRoleChangedPayload = z.infer<typeof AdminUserRoleChangedPayload>;

export const AdminUserPasswordResetPayload = ActorRef.merge(UserRef);
export type AdminUserPasswordResetPayload = z.infer<typeof AdminUserPasswordResetPayload>;

export const AdminUserSessionsRevokedPayload = ActorRef.merge(UserRef).extend({
  count: z.number().int().nonnegative(),
});
export type AdminUserSessionsRevokedPayload = z.infer<typeof AdminUserSessionsRevokedPayload>;

export const ApiTokenCreatedPayload = z.object({
  userId: z.string(),
  actorUserId: z.string(),
  organizationId: z.string().nullable(),
  tokenId: z.string(),
  name: z.string(),
  scopes: z.array(z.string()),
  expiresAt: z.date().nullable(),
});
export type ApiTokenCreatedPayload = z.infer<typeof ApiTokenCreatedPayload>;

export const ApiTokenRevokedPayload = z.object({
  userId: z.string(),
  actorUserId: z.string().nullable(),
  organizationId: z.string().nullable(),
  tokenId: z.string(),
  reason: z.enum(["user", "membership_lost", "leaked"]),
});
export type ApiTokenRevokedPayload = z.infer<typeof ApiTokenRevokedPayload>;

export const ApiTokenUsedPayload = z.object({
  userId: z.string(),
  actorUserId: z.string(),
  organizationId: z.string().nullable(),
  tokenId: z.string(),
  scopes: z.array(z.string()),
});
export type ApiTokenUsedPayload = z.infer<typeof ApiTokenUsedPayload>;

export const NotificationPreferenceUpdatedPayload = UserRef.extend({
  category: z.string(),
  channel: z.string(),
  enabled: z.boolean(),
  frequency: z.string(),
});
export type NotificationPreferenceUpdatedPayload = z.infer<
  typeof NotificationPreferenceUpdatedPayload
>;

export const NotificationOrgPreferenceUpdatedPayload = OrgRef.extend({
  actorUserId: z.string(),
  category: z.string(),
  channel: z.string(),
  enabled: z.boolean(),
  frequency: z.string(),
  locked: z.boolean(),
});
export type NotificationOrgPreferenceUpdatedPayload = z.infer<
  typeof NotificationOrgPreferenceUpdatedPayload
>;

// Subject and actor are the same person: both routes carry `denyImpersonated`
// and the update is scoped to rows the caller owns, so no admin or system can
// reach it on someone else's behalf. `userId` alone therefore satisfies §7 —
// there is no second party to name, and `actorUserId` would only restate it.
//
// `notificationIds` carries what actually changed for an explicit selection
// (bounded by the request body at 100). "Mark all as read" reports `count`
// only: the unread set has no bound, and copying it into the outbox and the
// audit row would buy a detail nobody reads at the price of rows of arbitrary
// size.
export const NotificationReadPayload = UserRef.extend({
  scope: z.enum(["selection", "all"]),
  count: z.number().int().positive(),
  notificationIds: z.array(z.string()),
});
export type NotificationReadPayload = z.infer<typeof NotificationReadPayload>;

const SsoProviderRef = z.object({
  actorUserId: z.string(),
  organizationId: z.string(),
  providerId: z.string(),
});

export const SsoProviderRegisteredPayload = SsoProviderRef.extend({
  protocol: z.enum(["saml", "oidc"]),
  domain: z.string(),
  issuer: z.string(),
});
export type SsoProviderRegisteredPayload = z.infer<typeof SsoProviderRegisteredPayload>;

export const SsoProviderUpdatedPayload = SsoProviderRef.extend({
  changedFields: z.array(z.string()),
});
export type SsoProviderUpdatedPayload = z.infer<typeof SsoProviderUpdatedPayload>;

export const SsoProviderDeletedPayload = SsoProviderRef;
export type SsoProviderDeletedPayload = z.infer<typeof SsoProviderDeletedPayload>;

export const SsoDomainVerifiedPayload = SsoProviderRef.extend({ domain: z.string() });
export type SsoDomainVerifiedPayload = z.infer<typeof SsoDomainVerifiedPayload>;

export const SsoEnforcementChangedPayload = z.object({
  actorUserId: z.string(),
  organizationId: z.string(),
  enforced: z.boolean(),
  viaPlatformAdmin: z.boolean(),
});
export type SsoEnforcementChangedPayload = z.infer<typeof SsoEnforcementChangedPayload>;

export const SsoLoginSuccessPayload = UserRef.extend({
  providerId: z.string(),
  organizationId: z.string().nullable(),
  protocol: z.enum(["saml", "oidc"]),
  jitProvisioned: z.boolean(),
});
export type SsoLoginSuccessPayload = z.infer<typeof SsoLoginSuccessPayload>;

export const SsoLoginFailurePayload = z.object({
  actorUserId: z.string().nullable(),
  providerId: z.string().nullable(),
  domain: z.string(),
  reason: z.string(),
  ip: z.string(),
});
export type SsoLoginFailurePayload = z.infer<typeof SsoLoginFailurePayload>;

const ScimConnectionRef = z.object({
  actorUserId: z.string(),
  organizationId: z.string(),
  providerId: z.string(),
});

export const ScimConnectionCreatedPayload = ScimConnectionRef;
export type ScimConnectionCreatedPayload = z.infer<typeof ScimConnectionCreatedPayload>;

export const ScimConnectionDeletedPayload = ScimConnectionRef;
export type ScimConnectionDeletedPayload = z.infer<typeof ScimConnectionDeletedPayload>;

const ScimUserRef = z.object({
  userId: z.string(),
  actorUserId: z.string().nullable(),
  organizationId: z.string(),
  scimProviderId: z.string(),
  externalId: z.string().nullable(),
});

export const ScimUserCreatedPayload = ScimUserRef;
export type ScimUserCreatedPayload = z.infer<typeof ScimUserCreatedPayload>;

export const ScimUserUpdatedPayload = ScimUserRef.extend({
  changedFields: z.array(z.string()),
});
export type ScimUserUpdatedPayload = z.infer<typeof ScimUserUpdatedPayload>;

export const ScimUserDeactivatedPayload = ScimUserRef;
export type ScimUserDeactivatedPayload = z.infer<typeof ScimUserDeactivatedPayload>;

export const ScimUserDeprovisionedPayload = ScimUserRef;
export type ScimUserDeprovisionedPayload = z.infer<typeof ScimUserDeprovisionedPayload>;

export const PayloadByEventType = {
  [EventTypes.USER_CREATED]: UserCreatedPayload,
  [EventTypes.USER_SIGNED_IN]: UserSignedInPayload,
  [EventTypes.USER_SIGNED_OUT]: UserSignedOutPayload,
  [EventTypes.USER_EMAIL_VERIFIED]: UserEmailVerifiedPayload,
  [EventTypes.USER_PASSWORD_RESET_REQUESTED]: UserPasswordResetRequestedPayload,
  [EventTypes.USER_PASSWORD_CHANGED]: UserPasswordChangedPayload,
  [EventTypes.USER_MAGIC_LINK_REQUESTED]: UserMagicLinkRequestedPayload,
  [EventTypes.USER_MFA_ENABLED]: UserMfaEnabledPayload,
  [EventTypes.USER_MFA_DISABLED]: UserMfaDisabledPayload,
  [EventTypes.USER_MFA_BACKUP_CODES_REGENERATED]: UserMfaBackupCodesRegeneratedPayload,
  [EventTypes.USER_MFA_BACKUP_CODE_USED]: UserMfaBackupCodeUsedPayload,
  [EventTypes.USER_PASSKEY_ADDED]: UserPasskeyAddedPayload,
  [EventTypes.USER_PASSKEY_REMOVED]: UserPasskeyRemovedPayload,
  [EventTypes.USER_ACCOUNT_LINKED]: UserAccountLinkedPayload,
  [EventTypes.USER_ACCOUNT_UNLINKED]: UserAccountUnlinkedPayload,
  [EventTypes.USER_DELETION_REQUESTED]: UserDeletionRequestedPayload,
  [EventTypes.USER_DELETION_CANCELLED]: UserDeletionCancelledPayload,
  [EventTypes.USER_DELETED]: UserDeletedPayload,
  [EventTypes.USER_PROFILE_UPDATED]: UserProfileUpdatedPayload,
  [EventTypes.USER_EMAIL_CHANGE_REQUESTED]: UserEmailChangeRequestedPayload,
  [EventTypes.USER_EXPORT_REQUESTED]: UserExportRequestedPayload,
  [EventTypes.USER_EXPORT_COMPLETED]: UserExportCompletedPayload,
  [EventTypes.USER_LOCALE_CHANGED]: UserLocaleChangedPayload,
  [EventTypes.ORG_CREATED]: OrgCreatedPayload,
  [EventTypes.ORG_UPDATED]: OrgUpdatedPayload,
  [EventTypes.ORG_DELETED]: OrgDeletedPayload,
  [EventTypes.ORG_MEMBER_INVITED]: OrgMemberInvitedPayload,
  [EventTypes.ORG_MEMBER_JOINED]: OrgMemberJoinedPayload,
  [EventTypes.ORG_INVITATION_CANCELLED]: OrgInvitationCancelledPayload,
  [EventTypes.ORG_MEMBER_REMOVED]: OrgMemberRemovedPayload,
  [EventTypes.ORG_MEMBER_ROLE_CHANGED]: OrgMemberRoleChangedPayload,
  [EventTypes.UPLOAD_REQUESTED]: UploadRequestedPayload,
  [EventTypes.UPLOAD_CONFIRMED]: UploadConfirmedPayload,
  [EventTypes.UPLOAD_DELETED]: UploadDeletedPayload,
  [EventTypes.WEBHOOK_ENDPOINT_CREATED]: WebhookEndpointCreatedPayload,
  [EventTypes.WEBHOOK_ENDPOINT_UPDATED]: WebhookEndpointUpdatedPayload,
  [EventTypes.WEBHOOK_ENDPOINT_DELETED]: WebhookEndpointDeletedPayload,
  [EventTypes.WEBHOOK_TEST]: WebhookTestPayload,
  [EventTypes.WEBHOOK_ENDPOINT_SECRET_ROTATED]: WebhookEndpointSecretRotatedPayload,
  [EventTypes.WEBHOOK_ENDPOINT_DISABLED]: WebhookEndpointDisabledPayload,
  [EventTypes.WEBHOOK_DELIVERY_EXHAUSTED]: WebhookDeliveryExhaustedPayload,
  [EventTypes.EMAIL_DELIVERY_EXHAUSTED]: EmailDeliveryExhaustedPayload,
  [EventTypes.USER_POLICY_ACCEPTED]: UserPolicyAcceptedPayload,
  [EventTypes.USER_COOKIE_CONSENT_GRANTED]: UserCookieConsentGrantedPayload,
  [EventTypes.USER_COOKIE_CONSENT_WITHDRAWN]: UserCookieConsentWithdrawnPayload,
  [EventTypes.SECURITY_RATE_LIMIT_EXCEEDED]: SecurityRateLimitExceededPayload,
  [EventTypes.SECURITY_CSP_VIOLATION]: SecurityCspViolationPayload,
  [EventTypes.SECURITY_CSRF_REJECTED]: SecurityCsrfRejectedPayload,
  [EventTypes.SECURITY_PASSWORD_BREACHED]: SecurityPasswordBreachedPayload,
  [EventTypes.SECURITY_SIGNUP_REJECTED]: SecuritySignupRejectedPayload,
  [EventTypes.SECURITY_OPERATOR_AUDIT_ACCESSED]: SecurityOperatorAuditAccessedPayload,
  [EventTypes.BILLING_SUBSCRIPTION_CREATED]: BillingSubscriptionCreatedPayload,
  [EventTypes.BILLING_SUBSCRIPTION_UPDATED]: BillingSubscriptionUpdatedPayload,
  [EventTypes.BILLING_SUBSCRIPTION_CANCELLED]: BillingSubscriptionCancelledPayload,
  [EventTypes.BILLING_PAYMENT_FAILED]: BillingPaymentFailedPayload,
  [EventTypes.BILLING_QUOTA_EXCEEDED]: BillingQuotaExceededPayload,
  [EventTypes.ADMIN_IMPERSONATION_STARTED]: AdminImpersonationStartedPayload,
  [EventTypes.ADMIN_IMPERSONATION_STOPPED]: AdminImpersonationStoppedPayload,
  [EventTypes.ADMIN_USER_BANNED]: AdminUserBannedPayload,
  [EventTypes.ADMIN_USER_UNBANNED]: AdminUserUnbannedPayload,
  [EventTypes.ADMIN_USER_ROLE_CHANGED]: AdminUserRoleChangedPayload,
  [EventTypes.ADMIN_USER_PASSWORD_RESET]: AdminUserPasswordResetPayload,
  [EventTypes.ADMIN_USER_SESSIONS_REVOKED]: AdminUserSessionsRevokedPayload,
  [EventTypes.API_TOKEN_CREATED]: ApiTokenCreatedPayload,
  [EventTypes.API_TOKEN_REVOKED]: ApiTokenRevokedPayload,
  [EventTypes.API_TOKEN_USED]: ApiTokenUsedPayload,
  [EventTypes.NOTIFICATION_PREFERENCE_UPDATED]: NotificationPreferenceUpdatedPayload,
  [EventTypes.NOTIFICATION_ORG_PREFERENCE_UPDATED]: NotificationOrgPreferenceUpdatedPayload,
  [EventTypes.NOTIFICATION_READ]: NotificationReadPayload,
  [EventTypes.SSO_PROVIDER_REGISTERED]: SsoProviderRegisteredPayload,
  [EventTypes.SSO_PROVIDER_UPDATED]: SsoProviderUpdatedPayload,
  [EventTypes.SSO_PROVIDER_DELETED]: SsoProviderDeletedPayload,
  [EventTypes.SSO_DOMAIN_VERIFIED]: SsoDomainVerifiedPayload,
  [EventTypes.SSO_ENFORCEMENT_CHANGED]: SsoEnforcementChangedPayload,
  [EventTypes.SSO_LOGIN_SUCCESS]: SsoLoginSuccessPayload,
  [EventTypes.SSO_LOGIN_FAILURE]: SsoLoginFailurePayload,
  [EventTypes.SCIM_CONNECTION_CREATED]: ScimConnectionCreatedPayload,
  [EventTypes.SCIM_CONNECTION_DELETED]: ScimConnectionDeletedPayload,
  [EventTypes.SCIM_USER_CREATED]: ScimUserCreatedPayload,
  [EventTypes.SCIM_USER_UPDATED]: ScimUserUpdatedPayload,
  [EventTypes.SCIM_USER_DEACTIVATED]: ScimUserDeactivatedPayload,
  [EventTypes.SCIM_USER_DEPROVISIONED]: ScimUserDeprovisionedPayload,
} as const;
