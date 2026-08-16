import { type EventType, EventTypes } from "./event-types";

export const EVENT_DESCRIPTIONS: Record<EventType, string> = {
  [EventTypes.USER_CREATED]: "A new user account was created.",
  [EventTypes.USER_SIGNED_IN]: "A user signed in to their account.",
  [EventTypes.USER_SIGNED_OUT]: "A user signed out of a session.",
  [EventTypes.USER_EMAIL_VERIFIED]: "A user verified their email address.",
  [EventTypes.USER_PASSWORD_RESET_REQUESTED]: "A user requested a password reset link.",
  [EventTypes.USER_PASSWORD_CHANGED]: "A user changed their password.",
  [EventTypes.USER_MAGIC_LINK_REQUESTED]: "A magic sign-in link was requested.",
  [EventTypes.USER_MFA_ENABLED]: "A user enabled two-factor authentication.",
  [EventTypes.USER_MFA_DISABLED]: "A user disabled two-factor authentication.",
  [EventTypes.USER_MFA_BACKUP_CODES_REGENERATED]:
    "A user regenerated their two-factor backup codes.",
  [EventTypes.USER_MFA_BACKUP_CODE_USED]: "A backup code was used to complete a sign-in.",
  [EventTypes.USER_PASSKEY_ADDED]: "A user registered a new passkey.",
  [EventTypes.USER_PASSKEY_REMOVED]: "A user removed a passkey.",
  [EventTypes.USER_ACCOUNT_LINKED]: "A user linked a third-party sign-in provider.",
  [EventTypes.USER_ACCOUNT_UNLINKED]: "A user unlinked a third-party sign-in provider.",
  [EventTypes.USER_DELETION_REQUESTED]: "A user scheduled their account for deletion.",
  [EventTypes.USER_DELETION_CANCELLED]: "A user cancelled a pending account deletion.",
  [EventTypes.USER_DELETED]: "A user account was permanently deleted.",
  [EventTypes.USER_PROFILE_UPDATED]: "A user updated their profile details.",
  [EventTypes.USER_EMAIL_CHANGE_REQUESTED]: "A user requested to change their email address.",
  [EventTypes.USER_EXPORT_REQUESTED]: "A user requested an export of their personal data.",
  [EventTypes.USER_EXPORT_COMPLETED]: "A user's personal data export is ready to download.",
  [EventTypes.ORG_CREATED]: "A new organization was created.",
  [EventTypes.ORG_UPDATED]: "An organization's settings were updated.",
  [EventTypes.ORG_DELETED]: "An organization was deleted.",
  [EventTypes.ORG_MEMBER_INVITED]: "A member was invited to an organization.",
  [EventTypes.ORG_MEMBER_JOINED]: "A member joined an organization.",
  [EventTypes.ORG_INVITATION_CANCELLED]: "A pending organization invitation was cancelled.",
  [EventTypes.ORG_MEMBER_REMOVED]: "A member was removed from an organization.",
  [EventTypes.ORG_MEMBER_ROLE_CHANGED]: "An organization member's role was changed.",
  [EventTypes.UPLOAD_REQUESTED]: "A file upload was requested (presigned URL issued).",
  [EventTypes.UPLOAD_CONFIRMED]: "A file upload was confirmed as stored.",
  [EventTypes.UPLOAD_DELETED]: "An uploaded file was deleted.",
  [EventTypes.WEBHOOK_ENDPOINT_CREATED]: "A webhook endpoint was created.",
  [EventTypes.WEBHOOK_ENDPOINT_UPDATED]: "A webhook endpoint was updated.",
  [EventTypes.WEBHOOK_ENDPOINT_DELETED]: "A webhook endpoint was deleted.",
  [EventTypes.WEBHOOK_TEST]: "A test delivery was sent to a webhook endpoint.",
  [EventTypes.WEBHOOK_ENDPOINT_SECRET_ROTATED]: "A webhook endpoint's signing secret was rotated.",
  [EventTypes.WEBHOOK_ENDPOINT_DISABLED]:
    "A webhook endpoint was auto-disabled after repeated delivery failures.",
  [EventTypes.WEBHOOK_DELIVERY_EXHAUSTED]:
    "A webhook delivery was abandoned after exhausting all retries.",
  [EventTypes.USER_POLICY_ACCEPTED]: "A user accepted a legal policy version.",
  [EventTypes.USER_COOKIE_CONSENT_GRANTED]: "Cookie consent was granted.",
  [EventTypes.USER_COOKIE_CONSENT_WITHDRAWN]: "Cookie consent was withdrawn.",
  [EventTypes.SECURITY_RATE_LIMIT_EXCEEDED]: "A rate limit was exceeded.",
  [EventTypes.SECURITY_CSP_VIOLATION]: "A Content-Security-Policy violation was reported.",
  [EventTypes.SECURITY_CSRF_REJECTED]: "A request was rejected by CSRF origin checks.",
  [EventTypes.SECURITY_PASSWORD_BREACHED]:
    "A password was rejected for appearing in a known breach.",
  [EventTypes.SECURITY_SIGNUP_REJECTED]: "A sign-up was rejected (e.g. disposable email).",
  [EventTypes.SECURITY_OPERATOR_AUDIT_ACCESSED]: "A platform operator accessed the audit log.",
  [EventTypes.BILLING_SUBSCRIPTION_CREATED]: "A subscription was created.",
  [EventTypes.BILLING_SUBSCRIPTION_UPDATED]: "A subscription was updated.",
  [EventTypes.BILLING_SUBSCRIPTION_CANCELLED]: "A subscription was cancelled.",
  [EventTypes.BILLING_PAYMENT_FAILED]: "A subscription payment failed.",
  [EventTypes.BILLING_QUOTA_EXCEEDED]: "A plan quota was exceeded.",
  [EventTypes.EMAIL_DELIVERY_EXHAUSTED]:
    "An email was abandoned after exhausting all delivery attempts.",
  [EventTypes.ADMIN_IMPERSONATION_STARTED]:
    "A platform administrator started an impersonation session.",
  [EventTypes.ADMIN_IMPERSONATION_STOPPED]:
    "A platform administrator ended an impersonation session.",
  [EventTypes.ADMIN_USER_BANNED]: "A platform administrator banned a user account.",
  [EventTypes.ADMIN_USER_UNBANNED]: "A platform administrator lifted the ban on a user account.",
  [EventTypes.ADMIN_USER_ROLE_CHANGED]: "A platform administrator changed a user's platform role.",
  [EventTypes.ADMIN_USER_PASSWORD_RESET]:
    "A platform administrator triggered a password reset for a user.",
  [EventTypes.ADMIN_USER_SESSIONS_REVOKED]:
    "A platform administrator revoked all active sessions for a user.",
  [EventTypes.API_TOKEN_CREATED]: "A personal access token was created.",
  [EventTypes.API_TOKEN_REVOKED]: "A personal access token was revoked.",
  [EventTypes.API_TOKEN_USED]: "A personal access token was used to authenticate a request.",
  [EventTypes.NOTIFICATION_PREFERENCE_UPDATED]:
    "A user updated their personal notification preferences.",
  [EventTypes.NOTIFICATION_ORG_PREFERENCE_UPDATED]:
    "An organization administrator updated the organization notification preferences.",
  [EventTypes.SSO_PROVIDER_REGISTERED]:
    "An SSO identity provider was registered for an organization.",
  [EventTypes.SSO_PROVIDER_UPDATED]: "An SSO identity provider's configuration was changed.",
  [EventTypes.SSO_PROVIDER_DELETED]: "An SSO identity provider was removed from an organization.",
  [EventTypes.SSO_DOMAIN_VERIFIED]: "An organization proved ownership of an SSO domain.",
  [EventTypes.SSO_ENFORCEMENT_CHANGED]: "An organization turned SSO-only sign-in on or off.",
  [EventTypes.SSO_LOGIN_SUCCESS]: "A user signed in through an SSO identity provider.",
  [EventTypes.SSO_LOGIN_FAILURE]: "An SSO sign-in attempt was rejected.",
  [EventTypes.SCIM_CONNECTION_CREATED]:
    "A SCIM provisioning connection was created and its token issued.",
  [EventTypes.SCIM_CONNECTION_DELETED]: "A SCIM provisioning connection was deleted.",
  [EventTypes.SCIM_USER_CREATED]: "A user was provisioned into an organization through SCIM.",
  [EventTypes.SCIM_USER_UPDATED]: "A user's attributes were updated through SCIM.",
  [EventTypes.SCIM_USER_DEACTIVATED]: "A user was deactivated through SCIM.",
  [EventTypes.SCIM_USER_DEPROVISIONED]: "A user was removed from an organization through SCIM.",
};

export function descriptionFor(eventType: string): string {
  return EVENT_DESCRIPTIONS[eventType as EventType] ?? "";
}
