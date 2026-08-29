export default {
  subjects: {
    verifyEmail: "Confirm your email address",
    resetPassword: "Reset your password",
    magicLink: "Your sign-in link",
    orgInvitation: "You have been invited to {{orgName}}",
    dataExportReady: "Your data export is ready",
    deleteRequested: "Account deletion requested",
    deleteCancelled: "Account deletion cancelled",
    deleteCompleted: "Your account has been deleted",
    changeEmail: "Confirm your new email address",
    backupCodeUsed: "A backup code was used",
    impersonationStarted: "Support access to your account",
    apiTokenLeaked: "Your API token was automatically revoked",
    notificationDigest_one: "{{count}} new {{category}} notification",
    notificationDigest_other: "{{count}} new {{category}} notifications",
  },
  layout: {
    footer: "If you did not expect this email, you can ignore it.",
  },
  verifyEmail: {
    heading: "Confirm your email",
    body: "Hi {{name}}, confirm your address to finish setting up your account.",
    cta: "Confirm email",
  },
  resetPassword: {
    heading: "Reset your password",
    body: "Hi {{name}}, click the button below to reset your password. The link expires in 1 hour.",
    cta: "Reset password",
  },
  magicLink: {
    heading: "Sign in to your account",
    body: "Click the button below to sign in. This link is single-use and expires shortly.",
    cta: "Sign in",
  },
  orgInvitation: {
    heading: "You have been invited",
    body: "{{inviterName}} has invited you to join <org>{{orgName}}</org> as a {{role}}.",
    cta: "Accept invitation",
  },
  dataExportReady: {
    heading: "Your data export is ready",
    body: "Hi {{name}}, your data export is ready to download. The link expires on {{expiresAt}}.",
    cta: "Download export",
  },
  deleteRequested: {
    heading: "Account deletion requested",
    body: "Hi {{name}}, we received a request to delete your account. The deletion will be processed on {{expiresAt}}. If this was not you, cancel now.",
    cta: "Cancel deletion",
  },
  deleteCancelled: {
    heading: "Account deletion cancelled",
    body: "Hi {{name}}, your account deletion request has been cancelled. Your account remains active.",
  },
  deleteCompleted: {
    heading: "Your account has been deleted",
    body: "Hi {{name}}, your account and all associated data have been permanently deleted.",
  },
  changeEmail: {
    heading: "Confirm your new email",
    body: "Hi {{name}}, confirm that you want to change your email address to {{newEmail}}.",
    cta: "Confirm new email",
  },
  backupCodeUsed: {
    heading: "A backup code was used",
    body: "A backup two-factor authentication code was just used to sign in to your account. If this was not you, review your account security immediately.",
    cta: "Review security settings",
  },
  impersonationStarted: {
    heading: "Support access to your account",
    body: "Hi {{userName}}, a member of our support team accessed your account for diagnostic purposes on {{startedAt}}. This access will automatically expire on {{expiresAt}}.",
    reason: "Stated reason: {{reason}}",
    scope:
      "This access is time-limited and does not allow changes to your password, payment details, or login credentials.",
    concerns:
      "If you did not contact our support team or have any concerns about this access, please reach out to us immediately.",
    cta: "Contact support",
  },
  apiTokenLeaked: {
    heading: "API token revoked",
    greeting: "Hi {{name}},",
    body: "Your API token <token>{{tokenName}}</token> was detected in a public repository and has been automatically revoked on {{revokedAt}} to protect your account.",
    help: "If you believe this was a mistake or need to regenerate the token, you can do so in your account settings.",
  },
  notificationDigest: {
    intro: "Here is a summary of your recent {{category}} activity:",
  },
} as const;
