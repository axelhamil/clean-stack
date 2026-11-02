import { describe, expect, it, mock } from "bun:test";
import { Option, Result } from "@packages/ddd-kit";
import { Hono } from "hono";
import * as realAuthQueries from "../../auth-queries";
import { generateToken, hmacToken } from "../../shared/crypto/api-token";
import { createErrorHandler } from "../../shared/middleware/error.middleware";
import { API_TOKEN_IP_POLICY } from "../../shared/middleware/rate-limit.policies";
import type { ApiTokenRecord, IApiTokenRepository } from "../../shared/ports/api-token.port";
import type {
  IRateLimiter,
  RateLimitDecision,
  RateLimitError,
} from "../../shared/ports/rate-limiter.port";
import { NoOpInstrumentation } from "../../shared/services/noop-instrumentation";
import { createPublicApiV1 } from "../index";

// ── Module mocks (only auth surface, no container/env/rate-limit.ip) ─────
// auth is mocked because it builds the BetterAuth singleton at module load
// time; auth-queries spreads the real module and only replaces the calls the
// middleware and routes can reach. container and env are NOT mocked (apps/api/.env is loaded by
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
  stripeCustomerId: "cus_123",
  pendingDeletionUntil: null,
  deletedAt: null,
  lastExportRequestedAt: null,
};

mock.module("../../auth-queries", () => ({
  ...realAuthQueries,
  findUserById: async (id: string) => (id === "u1" ? testUser : undefined),
  updateUserName: async () => {},
  findUserOrganizations: async () => [],
}));

// ── Token fixtures ────────────────────────────────────────────────────────

const PREFIX = "clean_";
const PEPPER = "a".repeat(32);

const { raw: validRaw } = generateToken(PREFIX);
const { raw: profileOnlyRaw } = generateToken(PREFIX);

const validHmac = hmacToken(validRaw, PEPPER);
const profileOnlyHmac = hmacToken(profileOnlyRaw, PEPPER);

const baseRecord: Omit<ApiTokenRecord, "id" | "scopes" | "tokenHmac" | "tokenStart"> = {
  userId: "u1",
  organizationId: Option.none(),
  name: "test",
  pepperVersion: 1,
  lastUsedAt: Option.none(),
  expiresAt: Option.none(),
  revokedAt: Option.none(),
  revokedReason: Option.none(),
  createdAt: new Date(),
};

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

// Always-allow rate limiter: boundary tests target auth/scope, not throttling.
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
// a live Bun server: no mock.module needed, zero global side effects.

const publicApiV1 = createPublicApiV1({
  repo: makeRepo(),
  outbox: mockOutbox,
  prefix: PREFIX,
  pepper: PEPPER,
  pepperVersion: 1,
  bucketMin: 15,
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

describe("public API response shape", () => {
  it("GET /me exposes only the public profile fields", async () => {
    const res = await app.request("/api/v1/me", {
      headers: { authorization: `Bearer ${validToken}` },
    });
    const body = (await res.json()) as { user: Record<string, unknown> };

    expect(Object.keys(body.user).sort()).toEqual([
      "createdAt",
      "email",
      "emailVerified",
      "id",
      "image",
      "name",
      "updatedAt",
    ]);
  });

  it("GET /me leaks no moderation, billing or lifecycle field", async () => {
    const res = await app.request("/api/v1/me", {
      headers: { authorization: `Bearer ${validToken}` },
    });
    const body = (await res.json()) as { user: Record<string, unknown> };

    for (const leaked of [
      "role",
      "banned",
      "banReason",
      "banExpires",
      "twoFactorEnabled",
      "pendingEmail",
      "stripeCustomerId",
      "pendingDeletionUntil",
      "deletedAt",
      "lastExportRequestedAt",
      "staff",
    ]) {
      expect(body.user).not.toHaveProperty(leaked);
    }
  });
});

describe("public API rate limit order", () => {
  const IP_BUDGET = API_TOKEN_IP_POLICY.windows[0]?.maxRequests ?? 0;

  function countingApp() {
    const counts = new Map<string, number>();
    const limiter: IRateLimiter = {
      consume: async (key, windows) => {
        const count = (counts.get(key) ?? 0) + 1;
        counts.set(key, count);
        const limit = windows[0]?.maxRequests ?? 0;
        return Result.ok<RateLimitDecision, RateLimitError>({
          allowed: count <= limit,
          limit,
          remaining: Math.max(0, limit - count),
          resetSeconds: 60,
          policyName: windows[0]?.policyName ?? "unknown",
          firstBlock: count === limit + 1,
        });
      },
    };
    const instance = new Hono().route(
      "/api/v1",
      createPublicApiV1({
        repo: makeRepo(),
        outbox: mockOutbox,
        prefix: PREFIX,
        pepper: PEPPER,
        pepperVersion: 1,
        bucketMin: 15,
        limiter,
        resolveIp: () => "203.0.113.9",
      }) as never,
    );
    instance.onError(createErrorHandler(new NoOpInstrumentation()));
    return { instance, counts };
  }

  it("ends in 429 when one IP keeps presenting invalid tokens", async () => {
    const { instance } = countingApp();
    const statuses = new Set<number>();
    for (let attempt = 0; attempt <= IP_BUDGET; attempt += 1) {
      const res = await instance.request("/api/v1/me", {
        headers: { authorization: "Bearer clean_not-a-real-token" },
      });
      statuses.add(res.status);
    }
    expect([...statuses]).toEqual([401, 429]);
  });

  it("still counts a valid token against its own budget", async () => {
    const { instance, counts } = countingApp();
    await instance.request("/api/v1/me", { headers: { authorization: `Bearer ${validToken}` } });
    expect(counts.get("tok:tok-valid")).toBe(1);
    expect(counts.get("tokip:203.0.113.9")).toBe(1);
  });

  it("answers an unknown path with a JSON 401 when no valid token is presented", async () => {
    const { instance } = countingApp();
    const res = await instance.request("/api/v1/nope");
    expect(res.status).toBe(401);
    expect(await res.json()).toMatchObject({ error: { code: "HTTP_401" } });
  });
});
