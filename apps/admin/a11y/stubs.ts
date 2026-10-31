const LONG_EMAIL = "bartholomew.fitzgerald-montgomery@northwind-industries-holdings.example.com";
const LONG_NAME = "Aleksandra Wisniewska-Kowalczyk-Montgomery de la Tour d'Auvergne";
const CREATED_AT = "2026-03-09T10:00:00.000Z";

export const STUB_USER_ID = "user-stub";

export const STUB_USER = {
  id: STUB_USER_ID,
  email: LONG_EMAIL,
  name: LONG_NAME,
  emailVerified: true,
  banned: false,
  banReason: null,
  banExpires: null,
  twoFactorEnabled: false,
  createdAt: CREATED_AT,
  memberships: [
    { organizationId: "org-stub", organizationName: LONG_NAME, role: "owner" },
    { organizationId: "org-other", organizationName: "Jo", role: "something-custom" },
  ],
  sessions: [
    {
      id: "session-stub",
      createdAt: CREATED_AT,
      expiresAt: "2030-01-01T00:00:00.000Z",
      ipAddress: "2001:0db8:85a3:0000:0000:8a2e:0370:7334",
      userAgent: `Mozilla/5.0 (X11; Linux x86_64) ${LONG_NAME}`,
      impersonatedBy: null,
    },
  ],
};

export const STUB_ORG = {
  id: "org-stub",
  name: LONG_NAME,
  slug: "northwind-industries-holdings-international-subsidiaries-europe",
  ssoEnforced: true,
  plan: "business",
  planOverride: {
    id: "override-plan-stub",
    tier: "business",
    note: LONG_NAME.repeat(4),
    expiresAt: "2030-01-01T00:00:00.000Z",
    createdAt: CREATED_AT,
  },
  memberCount: 1284,
  createdAt: CREATED_AT,
  members: [{ userId: STUB_USER_ID, email: LONG_EMAIL, role: "owner" }],
};

export const STUB_APPROVAL = {
  id: "approval-stub",
  action: "user.ban_permanent",
  subjectId: STUB_USER_ID,
  params: { reason: LONG_NAME.repeat(4) },
  requestedBy: "someone-else",
  status: "pending",
  decidedBy: null,
  decisionNote: null,
  failureReason: null,
  expiresAt: "2030-01-01T00:00:00.000Z",
  decidedAt: null,
  createdAt: CREATED_AT,
  version: 1,
};

export const STUB_MEMBERS = [
  {
    userId: "member-stub",
    email: LONG_EMAIL,
    name: LONG_NAME,
    role: "support",
    source: "console",
    createdAt: CREATED_AT,
  },
  {
    userId: "member-env",
    email: "listed@example.com",
    name: "",
    role: "manager",
    source: "env",
    createdAt: CREATED_AT,
  },
];

export const STUB_OVERRIDE = {
  id: "override-stub",
  permission: "approvals.decide",
  effect: "grant",
  expiresAt: "2030-01-01T00:00:00.000Z",
  createdAt: CREATED_AT,
};

export const STUB_DEAD_LETTERS = {
  outbox: {
    total: 2,
    items: [
      {
        id: "dead-event-stub",
        eventType: "billing.subscription.updated",
        aggregateType: "subscription",
        aggregateId: "sub_stub",
        occurredAt: CREATED_AT,
        deadAt: CREATED_AT,
        attempts: 25,
        lastError: `audit-log: ${LONG_EMAIL} ${LONG_NAME}`,
        nextAttemptAt: "2030-01-01T00:00:00.000Z",
      },
    ],
  },
  queues: { emails: 3, webhooks: 1 },
};

export const STUB_SWEEPS = {
  items: [
    {
      label: "sweep-email-messages",
      startedAt: CREATED_AT,
      finishedAt: CREATED_AT,
      outcome: "ok",
      durationMs: 12,
      count: 40,
    },
    {
      label: "sweep-audit-log",
      startedAt: CREATED_AT,
      finishedAt: CREATED_AT,
      outcome: "batch-error",
      durationMs: 12,
      count: 0,
    },
  ],
};

export const STUB_STRIPE_EVENTS = {
  configured: true,
  items: [
    {
      id: "evt_stub",
      type: "customer.subscription.updated",
      status: "failed",
      receivedAt: CREATED_AT,
      lastError: "The handler answered 400.",
      replayedAt: CREATED_AT,
    },
  ],
};

export const STUB_VIEWS = {
  items: [
    {
      id: "view-long",
      screen: "users",
      name: LONG_NAME.slice(0, 60),
      filters: { q: "montgomery" },
      updatedAt: CREATED_AT,
    },
    {
      id: "view-suspended",
      screen: "users",
      name: "Suspended",
      filters: { status: "suspended" },
      updatedAt: CREATED_AT,
    },
    {
      id: "view-org",
      screen: "orgs",
      name: "Northwind",
      filters: { q: "north" },
      updatedAt: CREATED_AT,
    },
    {
      id: "view-audit",
      screen: "audit",
      name: "Billing",
      filters: { action: "billing." },
      updatedAt: CREATED_AT,
    },
  ],
};

export const STUB_INBOX = {
  approvals: {
    total: 25,
    items: [
      {
        id: "approval-stub",
        action: "user.ban_permanent",
        requestedBy: "someone-else",
        createdAt: CREATED_AT,
      },
      {
        id: "approval-mine",
        action: "staff.revoke",
        requestedBy: "staff-id",
        createdAt: CREATED_AT,
      },
    ],
  },
  operations: {
    deadEvents: 2,
    deadEmails: 1,
    deadWebhooks: 0,
    failedSweeps: [
      {
        label: "sweep-audit-log-with-a-very-long-label-that-should-wrap-on-a-phone-screen",
        outcome: "batch-error",
        finishedAt: CREATED_AT,
      },
    ],
  },
};

export const STUB_NOTES = {
  items: [
    {
      id: "note-stub",
      authorName: LONG_NAME,
      body: `${LONG_EMAIL} ${LONG_NAME.repeat(3)}`,
      createdAt: CREATED_AT,
    },
    { id: "note-orphan", authorName: null, body: "Called back.", createdAt: CREATED_AT },
  ],
};
