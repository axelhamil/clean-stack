import { describe, expect, it, mock } from "bun:test";
import { Option, Result } from "@packages/ddd-kit";
import { Hono } from "hono";
import type {
  ApiTokenRecord,
  IApiTokenRepository,
} from "../../modules/api-token/application/ports/api-token.port";
import { generateToken, hmacToken } from "../../shared/crypto/api-token";
import type { RateLimitDecision, RateLimitError } from "../../shared/ports/rate-limiter.port";
import { createPublicApiV1 } from "../index";

// ── Module mocks (only auth surface — no container/env/rate-limit.ip) ─────
// auth and auth-queries are mocked because they import DB clients at module
// load time. container and env are NOT mocked (apps/api/.env is loaded by
// the Bun test runner, avoiding global state pollution across the test suite).

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
    Result.ok<RateLimitDecision, RateLimitError>({
      allowed: true,
      limit: 600,
      remaining: 599,
      resetSeconds: 60,
      policyName: "api-token",
      firstBlock: false,
    }),
};

// ── Imports AFTER module mocks ────────────────────────────────────────────

const { sessionMiddleware, requireAuth } = await import("../../shared/middleware/auth.middleware");
const { requireScope } = await import("../require-scope");

// ── Build the real sub-app via factory (exercises actual middleware order) ─
// resolveIp is injected to avoid calling hono/bun getConnInfo which requires
// a live Bun server — no mock.module needed, zero global side effects.

const publicApiV1 = createPublicApiV1({
  repo: makeRepo(),
  outbox: mockOutbox,
  prefix: PREFIX,
  pepper: PEPPER,
  pepperVersion: 1,
  bucketMin: 15,
  platformAdminIds: [],
  limiter: mockLimiter,
  resolveIp: () => "127.0.0.1",
});

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
