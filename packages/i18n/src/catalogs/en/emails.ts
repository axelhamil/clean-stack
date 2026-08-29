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
  verifyEmail: {
    heading: "Confirm your email",
    body: "Hi {{name}}, confirm your address to finish setting up your account.",
    cta: "Confirm email",
  },
} as const;
