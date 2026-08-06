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
    "Un administrateur plateforme a démarré une session d'impersonation.",
  [EventTypes.ADMIN_IMPERSONATION_STOPPED]: "Une session d'impersonation a pris fin.",
  [EventTypes.ADMIN_USER_BANNED]: "Un administrateur plateforme a suspendu un compte.",
  [EventTypes.ADMIN_USER_UNBANNED]:
    "Un administrateur plateforme a levé la suspension d'un compte.",
  [EventTypes.ADMIN_USER_ROLE_CHANGED]:
    "Un administrateur plateforme a modifié le rôle d'un compte.",
  [EventTypes.ADMIN_USER_PASSWORD_RESET]:
    "Un administrateur plateforme a déclenché une réinitialisation de mot de passe.",
  [EventTypes.ADMIN_USER_SESSIONS_REVOKED]:
    "Un administrateur plateforme a révoqué les sessions d'un compte.",
  [EventTypes.API_TOKEN_CREATED]: "A personal access token was created.",
  [EventTypes.API_TOKEN_REVOKED]: "A personal access token was revoked.",
  [EventTypes.API_TOKEN_USED]: "A personal access token was used to authenticate a request.",
};

export function descriptionFor(eventType: string): string {
  return EVENT_DESCRIPTIONS[eventType as EventType] ?? "";
}
