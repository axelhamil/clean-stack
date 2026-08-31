export default {
  fallback: "Something went wrong. Please try again.",
  byCode: {
    ACCOUNT_EXPORT_RATE_LIMITED: "You can request another data export in 24 hours.",
    ACCOUNT_PASSWORD_REQUIRED: "Confirm with your password.",
    ACCOUNT_DELETION_BLOCKED: "Resolve organization ownership before deleting your account.",
    ACCOUNT_DELETION_NOT_FOUND: "No deletion to cancel.",
    ACCOUNT_PASSWORD_INVALID: "Invalid password.",
    TWO_FACTOR_REQUIRED: "Confirm with your password or authenticator code.",
    TWO_FACTOR_INVALID: "Invalid authenticator code.",
    // BetterAuth's own `BASE_ERROR_CODES`. They are keyed here rather than
    // read off `error.message` because the library ships one English string
    // per code and no translation hook — the code is the only stable,
    // localisable identifier the client receives.
    INVALID_EMAIL_OR_PASSWORD: "Invalid email or password.",
    INVALID_EMAIL: "Enter a valid email address.",
    INVALID_PASSWORD: "Invalid password.",
    USER_NOT_FOUND: "No account matches those details.",
    USER_EMAIL_NOT_FOUND: "No account matches that email address.",
    USER_ALREADY_EXISTS: "An account already exists for that email address.",
    USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL:
      "An account already exists for that email address. Use another one.",
    EMAIL_NOT_VERIFIED: "Verify your email address before signing in.",
    EMAIL_ALREADY_VERIFIED: "That email address is already verified.",
    EMAIL_CAN_NOT_BE_UPDATED: "That email address cannot be used.",
    EMAIL_MISMATCH: "That email address does not match this request.",
    PASSWORD_TOO_SHORT: "That password is too short.",
    PASSWORD_TOO_LONG: "That password is too long.",
    PASSWORD_ALREADY_SET: "This account already has a password.",
    USER_ALREADY_HAS_PASSWORD: "Confirm with your existing password.",
    INVALID_TOKEN: "This link is invalid.",
    TOKEN_EXPIRED: "This link has expired. Request a new one.",
    SESSION_EXPIRED: "Your session has expired. Sign in again to continue.",
    SESSION_NOT_FRESH: "Sign in again to confirm this change.",
    CREDENTIAL_ACCOUNT_NOT_FOUND:
      "This account has no password — use the sign-in method you set up.",
    ACCOUNT_NOT_FOUND: "Account not found.",
    SOCIAL_ACCOUNT_ALREADY_LINKED: "That account is already linked to another user.",
    FAILED_TO_CREATE_USER: "We could not create your account. Please try again.",
    FAILED_TO_CREATE_SESSION: "We could not sign you in. Please try again.",
    REQUEST_INVALID:
      "Some of the information you entered isn't valid. Check the form and try again.",
    // BetterAuth plugin code sets (`twoFactor`, `passkey`, `organization`).
    // Keyed for the same reason as the base codes above, and separately from
    // them because they ship in their own modules: without these, every
    // authenticator failure collapses into one message and the user cannot
    // tell a wrong code from an expired one or from 2FA never being enabled.
    OTP_NOT_ENABLED: "One-time codes are not enabled on this account.",
    OTP_HAS_EXPIRED: "That code has expired. Request a new one.",
    TOTP_NOT_ENABLED: "No authenticator app is set up on this account.",
    TWO_FACTOR_NOT_ENABLED: "Two-factor authentication is not enabled on this account.",
    BACKUP_CODES_NOT_ENABLED: "No backup codes are set up on this account.",
    INVALID_BACKUP_CODE: "That backup code is not valid or has already been used.",
    INVALID_CODE: "That code is not correct. Check your authenticator app and try again.",
    TOO_MANY_ATTEMPTS_REQUEST_NEW_CODE: "Too many attempts. Request a new code.",
    ACCOUNT_TEMPORARILY_LOCKED:
      "Too many failed attempts. Your account is temporarily locked — try again later.",
    INVALID_TWO_FACTOR_COOKIE: "This verification step expired. Sign in again.",
    CHALLENGE_NOT_FOUND: "This passkey attempt expired. Try again.",
    YOU_ARE_NOT_ALLOWED_TO_REGISTER_THIS_PASSKEY: "This passkey cannot be registered here.",
    FAILED_TO_VERIFY_REGISTRATION: "We could not register that passkey. Try again.",
    PASSKEY_NOT_FOUND: "That passkey no longer exists.",
    AUTHENTICATION_FAILED: "Your device could not confirm your identity. Try again.",
    UNABLE_TO_CREATE_SESSION: "We could not sign you in. Please try again.",
    FAILED_TO_UPDATE_PASSKEY: "We could not update that passkey. Try again.",
    PREVIOUSLY_REGISTERED: "That passkey is already registered on this account.",
    REGISTRATION_CANCELLED: "Passkey setup was cancelled.",
    AUTH_CANCELLED: "Passkey sign-in was cancelled.",
    SESSION_REQUIRED: "Sign in before adding a passkey.",
    YOU_ARE_NOT_ALLOWED_TO_CREATE_A_NEW_ORGANIZATION:
      "You don't have permission to create an organization.",
    YOU_HAVE_REACHED_THE_MAXIMUM_NUMBER_OF_ORGANIZATIONS:
      "You have reached the maximum number of organizations.",
    ORGANIZATION_ALREADY_EXISTS: "An organization with that name already exists.",
    ORGANIZATION_SLUG_ALREADY_TAKEN: "That organization address is already taken.",
    ORGANIZATION_NOT_FOUND: "Organization not found.",
    USER_IS_NOT_A_MEMBER_OF_THE_ORGANIZATION: "That user is not a member of this organization.",
    YOU_ARE_NOT_ALLOWED_TO_UPDATE_THIS_ORGANIZATION:
      "You don't have permission to update this organization.",
    YOU_ARE_NOT_ALLOWED_TO_DELETE_THIS_ORGANIZATION:
      "You don't have permission to delete this organization.",
    NO_ACTIVE_ORGANIZATION: "Select an organization first.",
    USER_IS_ALREADY_A_MEMBER_OF_THIS_ORGANIZATION:
      "That user is already a member of this organization.",
    MEMBER_NOT_FOUND: "Member not found.",
    ROLE_NOT_FOUND: "Role not found.",
    YOU_CANNOT_LEAVE_THE_ORGANIZATION_AS_THE_ONLY_OWNER:
      "Transfer ownership before leaving: you are the only owner.",
    YOU_CANNOT_LEAVE_THE_ORGANIZATION_WITHOUT_AN_OWNER:
      "An organization must keep at least one owner.",
    YOU_ARE_NOT_ALLOWED_TO_DELETE_THIS_MEMBER: "You don't have permission to remove this member.",
    YOU_ARE_NOT_ALLOWED_TO_UPDATE_THIS_MEMBER: "You don't have permission to update this member.",
    YOU_ARE_NOT_ALLOWED_TO_INVITE_USERS_TO_THIS_ORGANIZATION:
      "You don't have permission to invite people to this organization.",
    USER_IS_ALREADY_INVITED_TO_THIS_ORGANIZATION: "That person has already been invited.",
    INVITATION_NOT_FOUND: "This invitation no longer exists.",
    YOU_ARE_NOT_THE_RECIPIENT_OF_THE_INVITATION: "This invitation was sent to another address.",
    EMAIL_VERIFICATION_REQUIRED_BEFORE_ACCEPTING_OR_REJECTING_INVITATION:
      "Verify your email address before responding to this invitation.",
    EMAIL_VERIFICATION_REQUIRED_FOR_INVITATION:
      "Verify your email address to see your invitations.",
    YOU_ARE_NOT_ALLOWED_TO_CANCEL_THIS_INVITATION:
      "You don't have permission to cancel this invitation.",
    INVITER_IS_NO_LONGER_A_MEMBER_OF_THE_ORGANIZATION:
      "The person who invited you is no longer a member of this organization.",
    YOU_ARE_NOT_ALLOWED_TO_INVITE_USER_WITH_THIS_ROLE:
      "You don't have permission to invite someone with that role.",
    FAILED_TO_RETRIEVE_INVITATION: "We could not load this invitation. Please try again.",
    INVITATION_LIMIT_REACHED: "You have reached the invitation limit for this organization.",
    ORGANIZATION_MEMBERSHIP_LIMIT_REACHED: "This organization has reached its member limit.",
    YOU_ARE_NOT_ALLOWED_TO_ACCESS_THIS_ORGANIZATION:
      "You don't have permission to access this organization.",
    YOU_ARE_NOT_A_MEMBER_OF_THIS_ORGANIZATION: "You are not a member of this organization.",
  },
  bySuffix: {
    RATE_LIMITED: "Too many requests. Please wait a moment and try again.",
    NOT_FOUND: "Not found.",
    FORBIDDEN: "You don't have permission to do this.",
    UNAUTHORIZED: "Please sign in again.",
    REQUIRED: "Additional confirmation required.",
    BLOCKED: "Action blocked.",
    INVALID: "Invalid input.",
    INTEGRITY_FAILED: "Data integrity check failed. Please try again.",
    PROVIDER_FAILURE: "Service is temporarily unavailable. Please try again.",
    UNAVAILABLE: "Service is temporarily unavailable. Please try again.",
    TIMEOUT: "Request timed out. Please try again.",
  },
  rateLimit: {
    retryInSeconds_one: "Try again in {{count}} second.",
    retryInSeconds_other: "Try again in {{count}} seconds.",
    retryInMinutes_one: "Try again in {{count}} minute.",
    retryInMinutes_other: "Try again in {{count}} minutes.",
    retryInHours_one: "Try again in {{count}} hour.",
    retryInHours_other: "Try again in {{count}} hours.",
  },
  validation: {
    required: "This field is required.",
    invalidEmail: "Enter a valid email address.",
    invalidUrl: "Enter a valid URL.",
    invalidFormat: "Invalid format.",
    totpCode: "Enter the 6-digit code from your authenticator app.",
    backupCode: "Enter a valid backup code.",
    httpsUrl: "Enter a valid https URL.",
    bareDomain: "Enter a bare domain, without https:// or a path.",
    tooSmall: "Must be at least {{minimum}} characters.",
    tooBig: "Must be at most {{maximum}} characters.",
    tooFewItems: "Select at least {{minimum}}.",
    passwordsMismatch: "Passwords do not match.",
    acceptPolicies: "You must accept the required policies.",
    invalidEventSelection: "Contains an unknown or non-subscribable event.",
  },
} as const;
