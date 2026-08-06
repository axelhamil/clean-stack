export const EventTypes = {
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

export type EventType = (typeof EventTypes)[keyof typeof EventTypes];

export const ALL_EVENT_TYPES: readonly EventType[] = Object.values(EventTypes);

export function isKnownEventType(value: string): value is EventType {
  return ALL_EVENT_TYPES.includes(value as EventType);
}

export const INTERNAL_EVENT_TYPES: readonly EventType[] = [
  EventTypes.WEBHOOK_TEST,
  EventTypes.WEBHOOK_ENDPOINT_SECRET_ROTATED,
  EventTypes.WEBHOOK_ENDPOINT_DISABLED,
  EventTypes.WEBHOOK_DELIVERY_EXHAUSTED,
  EventTypes.EMAIL_DELIVERY_EXHAUSTED,
];

export const SUBSCRIBABLE_EVENT_TYPES: readonly EventType[] = ALL_EVENT_TYPES.filter(
  (t) => !INTERNAL_EVENT_TYPES.includes(t),
);

export function eventGroupOf(eventType: string): string {
  const dot = eventType.indexOf(".");
  return dot === -1 ? eventType : eventType.slice(0, dot);
}

export function matchesSubscription(
  eventType: EventType,
  subscriptions: readonly string[],
): boolean {
  if (INTERNAL_EVENT_TYPES.includes(eventType)) return false;
  if (subscriptions.includes("*")) return true;
  if (subscriptions.includes(eventType)) return true;
  return subscriptions.includes(`${eventGroupOf(eventType)}.*`);
}

export function isSubscribableSelector(value: string): boolean {
  if (value === "*") return true;
  if (value.endsWith(".*")) {
    const group = value.slice(0, -2);
    return SUBSCRIBABLE_EVENT_TYPES.some((t) => eventGroupOf(t) === group);
  }
  return SUBSCRIBABLE_EVENT_TYPES.includes(value as EventType);
}
