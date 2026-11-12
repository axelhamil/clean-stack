import { describe, expect, it, mock } from "bun:test";
import type { ApiTokenRecord } from "@modules/api-token/application/ports/api-token.port";
import { generateToken, hmacToken } from "@modules/api-token/domain/api-token-crypto";
import {
  type IInstrumentation,
  type ILogger,
  NoOpInstrumentation,
  Option,
  Result,
  UnitOfWorkContext,
} from "@packages/ddd-kit";
import type { IOutboxRepository } from "@packages/outbox/outbox.port";
import { mockPort } from "@packages/test/bun";
import { mockUnitOfWork } from "@packages/test/bun/unit-of-work";
import { Hono } from "hono";

const PREFIX = "clean_";
const PEPPER = "a".repeat(32);
const PREV_PEPPER = "b".repeat(32);
const BUCKET_MIN = 15;
const PEPPER_VERSION = 1;

const ownerRow = () => ({
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
  locale: null as string | null,
  role: null as string | null,
  banned: false as boolean | null,
  banReason: null as string | null,
  banExpires: null as Date | null,
});

const findUserByIdSpy = mock(async (_id: string) => ownerRow());

const { requireApiToken } = await import("../middleware/api-token.middleware");

function makeRecord(over: Partial<ApiTokenRecord> = {}): ApiTokenRecord {
  const { raw } = generateToken(PREFIX);
  return {
    id: "tok-1",
    userId: "u1",
    organizationId: Option.none(),
    name: "ci",
    scopes: ["read:profile"],
    tokenHmac: hmacToken(raw, PEPPER),
    pepperVersion: 1,
    tokenStart: raw.slice(0, PREFIX.length + 8),
    lastUsedAt: Option.none(),
    expiresAt: Option.none(),
    revokedAt: Option.none(),
    revokedReason: Option.none(),
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
    uow: mockUnitOfWork().unitOfWork,
    instrumentation: new NoOpInstrumentation(),
    logger: mockPort<ILogger>(),
    queries: { findUserById: findUserByIdSpy },
    prefix: PREFIX,
    pepper: PEPPER,
    pepperVersion: PEPPER_VERSION,
    bucketMin: BUCKET_MIN,
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
    const record = makeRecord({
      tokenHmac: hmacToken(raw, PEPPER),
      revokedAt: Option.some(new Date()),
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

  it("returns 401 for an expired token", async () => {
    const { raw } = generateToken(PREFIX);
    const record = makeRecord({
      tokenHmac: hmacToken(raw, PEPPER),
      expiresAt: Option.some(new Date(Date.now() - 1000)),
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

  it("returns 401 for a valid token whose owner is banned", async () => {
    const { raw } = generateToken(PREFIX);
    const record = makeRecord({ tokenHmac: hmacToken(raw, PEPPER) });
    const { repo } = makeRepo(async () => Result.ok(Option.some(record)));

    findUserByIdSpy.mockImplementationOnce(async () => ({
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
      locale: null as string | null,
      role: null as string | null,
      banned: true as boolean | null,
      banReason: "policy violation" as string | null,
      banExpires: null as Date | null,
    }));

    const deps = makeDeps(repo);
    const app = new Hono()
      .use(requireApiToken(deps, { scopes: [] }))
      .get("/x", (c) => c.text("ok"));

    const res = await app.request("/x", {
      headers: { authorization: `Bearer ${raw}` },
    });
    expect(res.status).toBe(401);
  });

  it("returns 401 for a valid token whose owner account was erased", async () => {
    const { raw } = generateToken(PREFIX);
    const record = makeRecord({ tokenHmac: hmacToken(raw, PEPPER) });
    const { repo } = makeRepo(async () => Result.ok(Option.some(record)));
    findUserByIdSpy.mockImplementationOnce(async () => ({ ...ownerRow(), deletedAt: new Date() }));
    const app = new Hono()
      .use(requireApiToken(makeDeps(repo), { scopes: [] }))
      .get("/x", (c) => c.text("ok"));

    const res = await app.request("/x", { headers: { authorization: `Bearer ${raw}` } });

    expect(res.status).toBe(401);
  });

  it("lets a token through when the ban has already expired", async () => {
    const { raw } = generateToken(PREFIX);
    const record = makeRecord({ tokenHmac: hmacToken(raw, PEPPER) });
    const { repo } = makeRepo(async () => Result.ok(Option.some(record)));

    findUserByIdSpy.mockImplementationOnce(async () => ({
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
      locale: null as string | null,
      role: null as string | null,
      banned: true as boolean | null,
      banReason: null as string | null,
      banExpires: new Date(Date.now() - 1000) as Date | null,
    }));

    const deps = makeDeps(repo);
    const app = new Hono()
      .use(requireApiToken(deps, { scopes: [] }))
      .get("/x", (c) => c.text("ok"));

    const res = await app.request("/x", {
      headers: { authorization: `Bearer ${raw}` },
    });
    expect(res.status).toBe(200);
  });

  it("does not rehash a revoked token found via the previous pepper", async () => {
    const { raw } = generateToken(PREFIX);
    const prevHmac = hmacToken(raw, PREV_PEPPER);
    const record = makeRecord({
      tokenHmac: prevHmac,
      pepperVersion: 1,
      revokedAt: Option.some(new Date()),
    });

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

  it("records the token use and its event in one transaction", async () => {
    const { raw } = generateToken(PREFIX);
    const record = makeRecord({ tokenHmac: hmacToken(raw, PEPPER) });
    const { repo } = makeRepo(async () => Result.ok(Option.some(record)));
    const transactions: unknown[] = [];
    repo.touchLastUsed.mockImplementation(async () => {
      transactions.push(UnitOfWorkContext.transaction());
      return Result.ok(true);
    });
    const tokenOutbox = mockPort<IOutboxRepository>();
    tokenOutbox.enqueue.mockImplementation(async () => {
      transactions.push(UnitOfWorkContext.transaction());
    });
    const app = new Hono()
      .use(requireApiToken({ ...makeDeps(repo), outbox: tokenOutbox }, { scopes: [] }))
      .get("/x", (c) => c.text("ok"));

    const res = await app.request("/x", { headers: { authorization: `Bearer ${raw}` } });

    expect(res.status).toBe(200);
    expect(transactions).toHaveLength(2);
    expect(transactions[0]).toBeDefined();
    expect(new Set(transactions).size).toBe(1);
  });

  it("keeps serving a valid token when its usage record cannot be written", async () => {
    const { raw } = generateToken(PREFIX);
    const record = makeRecord({ tokenHmac: hmacToken(raw, PEPPER) });
    const { repo } = makeRepo(async () => Result.ok(Option.some(record)));
    const failingOutbox = mockPort<IOutboxRepository>();
    const outage = new Error("outbox unavailable");
    failingOutbox.enqueue.mockRejectedValue(outage);
    const uow = mockUnitOfWork();
    const instrumentation = mockPort<IInstrumentation>();
    const app = new Hono()
      .use(
        requireApiToken(
          { ...makeDeps(repo), outbox: failingOutbox, uow: uow.unitOfWork, instrumentation },
          { scopes: [] },
        ),
      )
      .get("/x", (c) => c.text("ok"));

    const statuses = [];
    for (let i = 0; i < 2; i++) {
      const res = await app.request("/x", { headers: { authorization: `Bearer ${raw}` } });
      statuses.push(res.status);
    }

    expect(statuses).toEqual([200, 200]);
    expect(uow.outcome()).toBe("rolled_back");
    expect(instrumentation.capture).toHaveBeenCalledWith(outage, expect.anything());
  });
});
