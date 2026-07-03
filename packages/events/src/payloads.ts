import { z } from "zod";
import { EventTypes } from "./event-types";

const UserRef = z.object({ userId: z.string() });
const OrgRef = z.object({ organizationId: z.string() });
const Email = z.string().email();

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
  newEmail: z.string().email(),
});
export type UserEmailChangeRequestedPayload = z.infer<typeof UserEmailChangeRequestedPayload>;

export const UserExportRequestedPayload = UserRef;
export type UserExportRequestedPayload = z.infer<typeof UserExportRequestedPayload>;

export const UserExportCompletedPayload = UserRef.extend({
  storageKey: z.string(),
  expiresAt: z.coerce.date(),
});
export type UserExportCompletedPayload = z.infer<typeof UserExportCompletedPayload>;

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
  url: z.string().url(),
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

export const UserPolicyAcceptedPayload = UserRef.extend({
  policyType: z.string(),
  policyVersion: z.string(),
  ipAddress: z.string().optional(),
});
export type UserPolicyAcceptedPayload = z.infer<typeof UserPolicyAcceptedPayload>;

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
  [EventTypes.USER_POLICY_ACCEPTED]: UserPolicyAcceptedPayload,
  [EventTypes.SECURITY_RATE_LIMIT_EXCEEDED]: SecurityRateLimitExceededPayload,
  [EventTypes.SECURITY_CSP_VIOLATION]: SecurityCspViolationPayload,
  [EventTypes.SECURITY_CSRF_REJECTED]: SecurityCsrfRejectedPayload,
} as const;
