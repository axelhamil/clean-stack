export default {
  users: {
    pageTitle: "Accounts",
    searchPlaceholder: "Search…",
    loading: "Loading…",
    loadFailed: "Failed to load accounts.",
    loadMore: "Load more",
    allRolesPlaceholder: "All roles",
    allStatusesPlaceholder: "All statuses",
    allOption: "All",
    roleUser: "User",
    // Shared by the ban dialog's title and the ban form's own submit button —
    // both name the exact same action in the exact same flow.
    suspendAccountTitle: "Suspend account",
    // Shared by the ban form's duration options and the detail page's static
    // display of an existing permanent ban — same concept (no expiry), same
    // source (the ban's expiry state).
    durationPermanent: "Permanent",
    status: {
      active: "Active",
      suspended: "Suspended",
    },
    table: {
      email: "Email",
      name: "Name",
      role: "Role",
      status: "Status",
      created: "Created",
    },
    detail: {
      loading: "Loading…",
      loadFailed: "Failed to load account.",
      identityTitle: "Identity",
      twoFactorLabel: "Two-factor auth",
      twoFactorEnabled: "Enabled",
      twoFactorDisabled: "Disabled",
      memberSinceLabel: "Member since",
      accountStatusTitle: "Account status",
      reactivate: "Reactivate",
      suspend: "Suspend",
      impersonate: "Impersonate",
      impersonateDialogTitle: "Impersonate account",
      reasonLabel: "Reason",
      expiresLabel: "Expires",
      revokeSessions: "Revoke sessions",
      resetPassword: "Reset password",
      banSuccessToast: "Account suspended.",
      unbanSuccessToast: "Account reactivated.",
      impersonateSuccessToast: "Impersonation started.",
      revokeSessionsSuccessToast: "Sessions revoked.",
      resetPasswordSuccessToast: "Password reset email sent.",
    },
    sessions: {
      title: "Active sessions ({{count}})",
      empty: "No active sessions.",
      ipHeader: "IP",
      browserHeader: "Browser",
      createdHeader: "Created",
      expiresHeader: "Expires",
      typeHeader: "Type",
      typeImpersonation: "Impersonation",
      typeNormal: "Normal",
    },
    banForm: {
      reasonLabel: "Reason",
      reasonPlaceholder: "Reason for suspension…",
      durationLabel: "Duration",
      duration24h: "24 hours",
      duration7d: "7 days",
      duration30d: "30 days",
    },
    impersonateForm: {
      reasonLabel: "Reason",
      reasonPlaceholder: "Describe the reason for impersonation…",
      ticketRefLabel: "Ticket reference (optional)",
      // Format example for the admin, not copy — kept identical in both
      // locales and listed in ALLOWED_IDENTICAL.
      ticketRefPlaceholder: "SUP-42",
      submit: "Start impersonation",
    },
  },
} as const;
