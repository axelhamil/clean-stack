import { describe, expect, it, mock } from "bun:test";
import { Option, Result } from "@packages/ddd-kit";
import { Hono } from "hono";
import type { ApiTokenRecord } from "../../modules/api-token/application/ports/api-token.port";
import { generateToken, hmacToken } from "../crypto/api-token";

const PREFIX = "clean_";
const PEPPER = "a".repeat(32);
const PREV_PEPPER = "b".repeat(32);
const BUCKET_MIN = 15;
const PEPPER_VERSION = 1;

const findUserByIdSpy = mock(async (_id: string) => ({
  id: "u1",
  name: "Test",
  email: "t@example.com",
  emailVerified: true as boolean,
  image: null as string | null,
  createdAt: new Date(),
  updatedAt: new Date(),
  twoFactorEnabled: false as boolean | null,
  pendingDeletionUntil: null as Date | null,
  deletedAt: null as Date | null,
  lastExportRequestedAt: null as Date | null,
  pendingEmail: null as string | null,
  stripeCustomerId: null as string | null,
  role: null as string | null,
  banned: false as boolean | null,
  banReason: null as string | null,
  banExpires: null as Date | null,
}));

mock.module("../../auth-queries", () => ({
  findUserById: findUserByIdSpy,
}));

const { requireApiToken } = await import("../middleware/api-token.middleware");

function makeRecord(over: Partial<ApiTokenRecord> = {}): ApiTokenRecord {
  const { raw } = generateToken(PREFIX);
  return {
    id: "tok-1",
    userId: "u1",
    organizationId: null,
    name: "ci",
    scopes: ["read:profile"],
    tokenHmac: hmacToken(raw, PEPPER),
    pepperVersion: 1,
    tokenStart: raw.slice(0, PREFIX.length + 8),
    lastUsedAt: null,
    expiresAt: null,
    revokedAt: null,
    revokedReason: null,
    createdAt: new Date(),
    ...over,
  };
}

function makeRepo(
  findByHmacImpl?: (hmac: string) => Promise<Result<Option<ApiTokenRecord>, never>>,
): {
  repo: {
    findByHmac: ReturnType<typeof mock>;
    touchLastUsed: ReturnType<typeof mock>;
    rehash: ReturnType<typeof mock>;
  };
} {
  return {
    repo: {
      findByHmac: mock(findByHmacImpl ?? (async () => Result.ok(Option.none<ApiTokenRecord>()))),
      touchLastUsed: mock(async () => Result.ok(true)),
      rehash: mock(async () => Result.ok()),
    },
  };
}

const outbox = { enqueue: mock(async () => "evt") };

function makeDeps(repoOverride?: ReturnType<typeof makeRepo>["repo"]) {
  const { repo } = repoOverride ? { repo: repoOverride } : makeRepo();
  return {
    repo: repo as never,
    outbox: outbox as never,
    prefix: PREFIX,
    pepper: PEPPER,
    pepperVersion: PEPPER_VERSION,
    bucketMin: BUCKET_MIN,
    platformAdminIds: [] as string[],
  };
}

describe("requireApiToken", () => {
  it("passes a valid token and sets tokenScopes on the context", async () => {
    const { raw } = generateToken(PREFIX);
    const record = makeRecord({ tokenHmac: hmacToken(raw, PEPPER) });
    const { repo } = makeRepo(async () => Result.ok(Option.some(record)));

    const deps = makeDeps(repo);
    const app = new Hono()
      .use(requireApiToken(deps, { scopes: ["read:profile"] }))
      .get("/x", (c) => c.json({ scopes: c.get("tokenScopes" as never) }));

    const res = await app.request("/x", {
      headers: { authorization: `Bearer ${raw}` },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { scopes: string[] };
    expect(body.scopes).toEqual(["read:profile"]);
  });

  it("rejects a malformed token without ever hitting the database", async () => {
    const { repo } = makeRepo();
    const deps = makeDeps(repo);
    const app = new Hono()
      .use(requireApiToken(deps, { scopes: [] }))
      .get("/x", (c) => c.text("ok"));

    const res = await app.request("/x", {
      headers: { authorization: "Bearer clean_notarealtoken" },
    });
    expect(res.status).toBe(401);
    expect(repo.findByHmac).not.toHaveBeenCalled();
  });

  it("returns 401 for a revoked token", async () => {
    const { raw } = generateToken(PREFIX);
    const record = makeRecord({ tokenHmac: hmacToken(raw, PEPPER), revokedAt: new Date() });
    const { repo } = makeRepo(async () => Result.ok(Option.some(record)));

    const deps = makeDeps(repo);
    const app = new Hono()
      .use(requireApiToken(deps, { scopes: [] }))
      .get("/x", (c) => c.text("ok"));

    const res = await app.request("/x", {
      headers: { authorization: `Bearer ${raw}` },
    });
    expect(res.status).toBe(401);
  });

  it("returns 401 for an expired token", async () => {
    const { raw } = generateToken(PREFIX);
    const record = makeRecord({
      tokenHmac: hmacToken(raw, PEPPER),
      expiresAt: new Date(Date.now() - 1000),
    });
    const { repo } = makeRepo(async () => Result.ok(Option.some(record)));

    const deps = makeDeps(repo);
    const app = new Hono()
      .use(requireApiToken(deps, { scopes: [] }))
      .get("/x", (c) => c.text("ok"));

    const res = await app.request("/x", {
      headers: { authorization: `Bearer ${raw}` },
    });
    expect(res.status).toBe(401);
  });

  it("returns 403 when the token lacks a required scope", async () => {
    const { raw } = generateToken(PREFIX);
    const record = makeRecord({ tokenHmac: hmacToken(raw, PEPPER), scopes: ["read:profile"] });
    const { repo } = makeRepo(async () => Result.ok(Option.some(record)));

    const deps = makeDeps(repo);
    const app = new Hono()
      .use(requireApiToken(deps, { scopes: ["write:profile"] }))
      .get("/x", (c) => c.text("ok"));

    const res = await app.request("/x", {
      headers: { authorization: `Bearer ${raw}` },
    });
    expect(res.status).toBe(403);
  });

  it("accepts a token hashed under the previous pepper and rehashes to the configured version", async () => {
    const { raw } = generateToken(PREFIX);
    const currentHmac = hmacToken(raw, PEPPER);
    const prevHmac = hmacToken(raw, PREV_PEPPER);
    // Stored pepperVersion is 1 (old); current configured version is 3.
    // Rehash must use deps.pepperVersion (3), not record.pepperVersion + 1 (2).
    const record = makeRecord({ tokenHmac: prevHmac, pepperVersion: 1 });

    const { repo } = makeRepo(async (hmac) => {
      if (hmac === prevHmac) return Result.ok(Option.some(record));
      return Result.ok(Option.none<ApiTokenRecord>());
    });

    const deps = {
      ...makeDeps(repo),
      pepperVersion: 3,
      pepperPrevious: PREV_PEPPER,
    };
    const app = new Hono()
      .use(requireApiToken(deps, { scopes: [] }))
      .get("/x", (c) => c.text("ok"));

    const res = await app.request("/x", {
      headers: { authorization: `Bearer ${raw}` },
    });
    expect(res.status).toBe(200);
    expect(repo.rehash).toHaveBeenCalledWith(record.id, currentHmac, 3);
  });

  it("does not rehash a revoked token found via the previous pepper", async () => {
    const { raw } = generateToken(PREFIX);
    const prevHmac = hmacToken(raw, PREV_PEPPER);
    const record = makeRecord({ tokenHmac: prevHmac, pepperVersion: 1, revokedAt: new Date() });

    const { repo } = makeRepo(async (hmac) => {
      if (hmac === prevHmac) return Result.ok(Option.some(record));
      return Result.ok(Option.none<ApiTokenRecord>());
    });

    const deps = {
      ...makeDeps(repo),
      pepperPrevious: PREV_PEPPER,
    };
    const app = new Hono()
      .use(requireApiToken(deps, { scopes: [] }))
      .get("/x", (c) => c.text("ok"));

    const res = await app.request("/x", {
      headers: { authorization: `Bearer ${raw}` },
    });
    expect(res.status).toBe(401);
    expect(repo.rehash).not.toHaveBeenCalled();
  });
});
