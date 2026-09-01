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
      changeRole: "Change role",
      changeRoleTitle: "Change this account's role",
      changeRoleDescription:
        "A platform admin can reach every organization's data and the operator audit log.",
      roleOptionUser: "User",
      roleOptionAdmin: "Platform admin",
      changeRoleSubmit: "Change role",
      changeRoleSuccessToast: "Role updated.",
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
  orgs: {
    pageTitle: "Organizations",
    searchPlaceholder: "Search…",
    loading: "Loading…",
    loadFailed: "Failed to load organizations.",
    loadMore: "Load more",
    ssoEnforcementUpdatedToast: "SSO enforcement updated.",
    ssoEnforcedAriaLabel: "SSO enforced for {{name}}",
    ssoEnforcementOffHint:
      "Turning SSO enforcement off lets members of that organization sign in with a password again.",
    table: {
      name: "Name",
      // "Slug" has no established French translation in SaaS products — kept
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
      // Same cognate as `table.slug` above, own key — this section has its
      // own copy so a translator can word it differently later if needed.
      slugLabel: "Slug",
      // "Plan" is spelled identically in French — a genuine cognate.
      planLabel: "Plan",
      createdLabel: "Created",
      membersTitle: "Members",
      table: {
        email: "Email",
        role: "Role",
      },
    },
  },
  auditLog: {
    pageTitle: "Audit log",
    allActionsPlaceholder: "All actions",
    allOption: "All",
    actorIdPlaceholder: "Actor ID",
    organizationIdPlaceholder: "Organization ID",
    loading: "Loading…",
    loadFailed: "Failed to load audit log.",
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
      broken: "Broken at #{{sequence}}",
    },
    metadata: {
      actorLabel: "Actor",
      occurredAtLabel: "Occurred at",
      beforeLabel: "Before",
      afterLabel: "After",
    },
  },
} as const;
