import { describe, expect, it, mock } from "bun:test";
import { Option, Result } from "@packages/ddd-kit";
import { Hono } from "hono";
import type {
  ApiTokenRecord,
  IApiTokenRepository,
} from "../../modules/api-token/application/ports/api-token.port";
import { generateToken, hmacToken } from "../../shared/crypto/api-token";

// ── Mocks registered before any dynamic import ───────────────────────────
// Factories are called lazily at the first `await import(...)` that needs
// the mocked module; they may safely close over variables defined below.

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

// Always-allow rate limiter — boundary tests target auth/scope, not throttling.
const mockLimiter = {
  consume: async () =>
    Result.ok({
      allowed: true as const,
      limit: 600,
      remaining: 599,
      resetSeconds: 60,
      policyName: "api-token",
      firstBlock: false as const,
    }),
};

// ── Container and env mocks (factories close over variables above) ────────

const mockDi = {
  IApiTokenRepository: makeRepo(),
  IOutboxRepository: mockOutbox,
  IRateLimiter: mockLimiter,
};

mock.module("../../container", () => ({ di: mockDi }));

mock.module("../../shared/env", () => ({
  env: {
    API_TOKEN_PREFIX: PREFIX,
    API_TOKEN_PEPPER: PEPPER,
    API_TOKEN_PEPPER_VERSION: 1,
    API_TOKEN_PEPPER_PREVIOUS: undefined,
    API_TOKEN_LAST_USED_BUCKET_MIN: 15,
    PLATFORM_ADMIN_IDS: [],
    NODE_ENV: "test",
    TRUSTED_PROXIES: undefined,
  },
}));

// `hono/bun` getConnInfo requires a live Bun server — unavailable in app.request().
// Stub IP resolution so the rate-limit policy keyFn doesn't crash.
mock.module("../../shared/middleware/rate-limit.ip", () => ({
  resolveClientIp: () => "127.0.0.1",
  normalizeHop: (s: string) => s,
}));

// ── Imports AFTER all mocks ───────────────────────────────────────────────

const { sessionMiddleware, requireAuth } = await import("../../shared/middleware/auth.middleware");
const { requireScope } = await import("../require-scope");
// Import the real publicApiV1 — exercises the actual middleware order
// (requireApiToken → API_TOKEN_POLICY → API_TOKEN_IP_POLICY → routes).
// Structural note: the always-allow mock limiter means an inverted auth/rate-limit
// order would still pass; that ordering guarantee lives in code review and the
// real index.ts owning the mount, not in these tests.
const { publicApiV1 } = await import("../index");

// ── Test app ─────────────────────────────────────────────────────────────

const app = new Hono()
  .use("*", sessionMiddleware)
  .get("/me", requireAuth, (c) => c.json({ user: c.get("user" as never) }))
  .route("/api/v1", publicApiV1 as never);

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

  it("requireScope returns 403 (not 500) when tokenScopes is absent", async () => {
    const isolated = new Hono().get("/", requireScope("read:profile"), (c) => c.json({ ok: true }));
    const res = await isolated.request("/");
    expect(res.status).toBe(403);
  });
});
