import { describe, expect, it, mock } from "bun:test";
import { Option, Result } from "@packages/ddd-kit";
import { Hono } from "hono";
import type {
  ApiTokenRecord,
  IApiTokenRepository,
} from "../../modules/api-token/application/ports/api-token.port";
import { generateToken, hmacToken } from "../../shared/crypto/api-token";

// ── Mocks registered before any dynamic import ───────────────────────────

mock.module("../../auth", () => ({
  auth: { api: { getSession: mock(async () => null) } },
}));

const testUser = {
  id: "u1",
  name: "Test User",
  email: "test@example.com",
  role: "user",
  emailVerified: true,
  image: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  banned: null,
  banReason: null,
  banExpires: null,
  twoFactorEnabled: null,
  pendingEmail: null,
};

mock.module("../../auth-queries", () => ({
  findUserById: async (id: string) => (id === "u1" ? testUser : undefined),
  updateUserName: async () => {},
  findUserOrganizations: async () => [],
  findActiveMemberOrgId: async () => undefined,
  insertPersonalOrgWithOwner: async () => {},
  setPendingEmail: async () => {},
  deleteOrgIfEmpty: async () => false,
  clearConfirmedPendingEmail: async () => false,
  findLatestPasskey: async () => undefined,
  findLatestLinkedAccount: async () => undefined,
  findActiveMemberRole: async () => null,
  findOrgOwnerUserId: async () => null,
  countActiveMembers: async () => 0,
}));

// ── Token fixtures ────────────────────────────────────────────────────────

const PREFIX = "clean_";
const PEPPER = "a".repeat(32);

const { raw: validRaw } = generateToken(PREFIX);
const { raw: profileOnlyRaw } = generateToken(PREFIX);

const validHmac = hmacToken(validRaw, PEPPER);
const profileOnlyHmac = hmacToken(profileOnlyRaw, PEPPER);

const baseRecord = {
  userId: "u1",
  organizationId: null,
  name: "test",
  pepperVersion: 1,
  lastUsedAt: null,
  expiresAt: null,
  revokedAt: null,
  revokedReason: null,
  createdAt: new Date(),
} as const;

const validRecord: ApiTokenRecord = {
  ...baseRecord,
  id: "tok-valid",
  scopes: ["read:profile", "write:profile", "read:organizations"],
  tokenHmac: validHmac,
  tokenStart: validRaw.slice(0, PREFIX.length + 8),
};

const profileOnlyRecord: ApiTokenRecord = {
  ...baseRecord,
  id: "tok-profile",
  scopes: ["read:profile"],
  tokenHmac: profileOnlyHmac,
  tokenStart: profileOnlyRaw.slice(0, PREFIX.length + 8),
};

function makeRepo(): IApiTokenRepository {
  return {
    findByHmac: async (hmac: string) => {
      if (hmac === validHmac) return Result.ok(Option.some(validRecord));
      if (hmac === profileOnlyHmac) return Result.ok(Option.some(profileOnlyRecord));
      return Result.ok(Option.none<ApiTokenRecord>());
    },
    touchLastUsed: async () => Result.ok(false),
    rehash: async () => Result.ok(),
    insert: async () => Result.ok(),
    listByOwner: async () => Result.ok([]),
    findByIdForOwner: async () => Result.ok(Option.none()),
    revoke: async () => Result.ok(),
    revokeAllForMembership: async () => Result.ok([]),
  } as IApiTokenRepository;
}

const mockOutbox = { enqueue: async () => {} } as never;

// ── Import middleware AFTER mocks ─────────────────────────────────────────

const { sessionMiddleware, requireAuth } = await import("../../shared/middleware/auth.middleware");
const { requireApiToken } = await import("../../shared/middleware/api-token.middleware");
const { mePublicRoutes } = await import("../v1/me.routes");
const { orgsPublicRoutes } = await import("../v1/organizations.routes");

const apiTokenDeps = {
  repo: makeRepo(),
  outbox: mockOutbox,
  prefix: PREFIX,
  pepper: PEPPER,
  pepperVersion: 1,
  bucketMin: 15,
  platformAdminIds: [] as string[],
};

// ── Test app replicating the pipeline boundary ────────────────────────────
// sessionMiddleware skips /api/v1/* (per auth.middleware change);
// /me is session-gated; /api/v1/* is token-gated with per-route scope checks.

const app = new Hono()
  .use("*", sessionMiddleware)
  .get("/me", requireAuth, (c) => c.json({ user: c.get("user" as never) }))
  .use("/api/v1/*", requireApiToken(apiTokenDeps, { scopes: [] }))
  .route("/api/v1/me", mePublicRoutes as never)
  .route("/api/v1/organizations", orgsPublicRoutes as never);

const validToken = validRaw;
const profileOnlyToken = profileOnlyRaw;
const validSessionCookie = "better-auth.session_token=fake-cookie-value";

// ── Tests ─────────────────────────────────────────────────────────────────

describe("public API boundary", () => {
  it("refuses a session cookie on /api/v1", async () => {
    const res = await app.request("/api/v1/me", { headers: { cookie: validSessionCookie } });
    expect(res.status).toBe(401);
  });

  it("refuses an API token on an internal route", async () => {
    const res = await app.request("/me", { headers: { authorization: `Bearer ${validToken}` } });
    expect(res.status).toBe(401);
  });

  it("accepts a scoped token on its own route", async () => {
    const res = await app.request("/api/v1/me", {
      headers: { authorization: `Bearer ${validToken}` },
    });
    expect(res.status).toBe(200);
  });

  it("refuses a token missing the route scope", async () => {
    const res = await app.request("/api/v1/organizations", {
      headers: { authorization: `Bearer ${profileOnlyToken}` },
    });
    expect(res.status).toBe(403);
  });
});
