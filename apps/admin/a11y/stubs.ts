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
  plan: null,
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
