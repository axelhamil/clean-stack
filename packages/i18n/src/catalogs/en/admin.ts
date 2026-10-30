export default {
  users: {
    pageTitle: "Accounts",
    searchPlaceholder: "Search…",
    loading: "Loading…",
    loadFailed: "Failed to load accounts.",
    empty: "No accounts match these filters.",
    loadMore: "Load more",
    allStatusesPlaceholder: "All statuses",
    // Shared by the ban dialog's title and the ban form's own submit button:
    // both name the exact same action in the exact same flow.
    suspendAccountTitle: "Suspend account",
    // Shared by the ban form's duration options and the detail page's static
    // display of an existing permanent ban: same concept (no expiry), same
    // source (the ban's expiry state).
    durationPermanent: "Permanent",
    status: {
      active: "Active",
      suspended: "Suspended",
    },
    table: {
      email: "Email",
      name: "Name",
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
      banPendingToast: "Request sent. A colleague must approve this suspension.",
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
      reasonRequired: "Enter a reason for the suspension first.",
      durationLabel: "Duration",
      duration24h: "24 hours",
      duration7d: "7 days",
      duration30d: "30 days",
    },
    impersonateForm: {
      reasonLabel: "Reason",
      reasonPlaceholder: "Describe the reason for impersonation…",
      reasonRequired: "Enter a reason for the impersonation first.",
      ticketRefLabel: "Ticket reference (optional)",
      // Format example for the admin, not copy, kept identical in both
      // locales and listed in ALLOWED_IDENTICAL.
      ticketRefPlaceholder: "SUP-42",
      submit: "Start impersonation",
    },
  },
  orgs: {
    pageTitle: "Organizations",
    searchPlaceholder: "Search…",
    loading: "Loading…",
    loadFailed: "Failed to load organizations.",
    empty: "No organizations match this search.",
    loadMore: "Load more",
    ssoEnforcementUpdatedToast: "SSO enforcement updated.",
    ssoEnforcedAriaLabel: "SSO enforced for {{name}}",
    ssoEnforcementOffHint:
      "Turning SSO enforcement off lets members of that organization sign in with a password again.",
    table: {
      name: "Name",
      // "Slug" has no established French translation in SaaS products, kept
      // identical in both locales and listed in ALLOWED_IDENTICAL.
      slug: "Slug",
      members: "Members",
      created: "Created",
      ssoEnforced: "SSO enforced",
    },
    detail: {
      loading: "Loading…",
      loadFailed: "Failed to load organization.",
      detailsTitle: "Details",
      // Same cognate as `table.slug` above, own key: this section has its
      // own copy so a translator can word it differently later if needed.
      slugLabel: "Slug",
      // "Plan" is spelled identically in French (a genuine cognate).
      planLabel: "Plan",
      createdLabel: "Created",
      membersTitle: "Members",
      membersEmpty: "This organization has no members.",
      table: {
        email: "Email",
        role: "Role",
      },
    },
  },
  backOffice: {
    brand: "Back office",
    nav: {
      label: "Back office sections",
      open: "Open the menu",
      description: "The sections your access opens.",
    },
    home: {
      title: "Home",
      empty: "Nothing to show here yet. The menu lists what your access opens.",
    },
    sectionNotBuilt: "This screen is not built yet.",
    sections: {
      users: "Accounts",
      orgs: "Organizations",
      audit: "Audit log",
      operations: "Operations",
      approvals: "Approvals",
      team: "Team",
    },
    denied: {
      title: "This account cannot open the back office",
      description: "Sign in with another account, or go back to the app.",
      needsTwoFactor: "Turn on two-factor authentication in your account settings, then come back.",
      needsPolicies: "Accept the updated policies in the app, then come back.",
      backToApp: "Go to the app",
      retry: "Try again",
    },
    notFound: {
      title: "Page not found",
      description: "This page does not exist or your access does not open it.",
      backHome: "Back to home",
    },
  },
  stepUp: {
    title: "Confirm it's you",
    description: "Enter the code from your authenticator app, then repeat your action.",
    codeLabel: "Authenticator code",
    submit: "Confirm",
    confirmedToast: "Confirmed. You can repeat your action.",
  },
  auditLog: {
    pageTitle: "Audit log",
    allActionsPlaceholder: "All actions",
    actorIdPlaceholder: "Actor ID",
    organizationIdPlaceholder: "Organization ID",
    loading: "Loading…",
    loadFailed: "Failed to load audit log.",
    empty: "No events match these filters.",
    occurredFromLabel: "From date",
    occurredToLabel: "To date",
    loadMore: "Load more",
    detailsAction: "Details",
    table: {
      occurredAt: "Occurred at",
      actorType: "Actor type",
      action: "Action",
      target: "Target",
      organization: "Organization",
    },
    actorType: {
      user: "User",
      system: "System",
      admin: "Admin",
    },
    chain: {
      checking: "Checking chain…",
      verified: "Chain verified ✓",
      verifiedHint:
        "Every audit entry still matches the hash of the one before it: nothing was altered.",
      broken: "Broken at #{{sequence}}",
      brokenHint:
        "An audit entry no longer matches the hash of the one before it: the log may have been altered.",
    },
    metadata: {
      actorLabel: "Actor",
      occurredAtLabel: "Occurred at",
      beforeLabel: "Before",
      afterLabel: "After",
    },
  },
} as const;
