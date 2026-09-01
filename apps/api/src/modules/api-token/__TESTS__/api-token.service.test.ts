import { describe, expect, it, mock } from "bun:test";
import { Option, Result } from "@packages/ddd-kit";
import { NoOpInstrumentation } from "../../../shared/services/noop-instrumentation";
import type {
  ApiTokenError,
  ApiTokenRecord,
  IApiTokenRepository,
} from "../application/ports/api-token.port";
import { ApiTokenService } from "../application/services/api-token.service";

function makeRepo(over: Partial<IApiTokenRepository> = {}): IApiTokenRepository {
  return {
    insert: mock(async () => Result.ok()),
    listByOwner: mock(async () => Result.ok<ApiTokenRecord[]>([])),
    findByIdForOwner: mock(async () => Result.ok(Option.none<ApiTokenRecord>())),
    findByHmac: mock(async () => Result.ok(Option.none<ApiTokenRecord>())),
    revoke: mock(async () => Result.ok()),
    revokeAllForMembership: mock(async () => Result.ok<string[]>([])),
    touchLastUsed: mock(async () => Result.ok(false)),
    rehash: mock(async () => Result.ok()),
    ...over,
  } as IApiTokenRepository;
}

const outbox = { enqueue: mock(async () => "evt") } as never;
const uow = { run: async (cb: (tx: unknown) => Promise<unknown>) => cb({}) } as never;

function makeService(repo = makeRepo()) {
  return new ApiTokenService(repo, outbox, uow, new NoOpInstrumentation(), {
    prefix: "clean_",
    pepper: "a".repeat(32),
    maxExpiryDays: 365,
    pepperVersion: 1,
  });
}

describe("ApiTokenService", () => {
  it("returns the raw token exactly once and never persists it", async () => {
    const repo = makeRepo();
    const created = await makeService(repo).create({
      userId: "u1",
      actorUserId: "u1",
      name: "ci",
      scopes: ["read:profile"],
      organizationId: null,
      expiresInDays: null,
    });

    const { raw, record } = created.getValue();
    expect(raw.startsWith("clean_")).toBe(true);
    expect(JSON.stringify(record)).not.toContain(raw);
    expect(record.tokenStart).toBe(raw.slice(0, 14));
  });

  it("refuses an expiry beyond the configured maximum", async () => {
    const repo = makeRepo();
    const result = await makeService(repo).create({
      userId: "u1",
      actorUserId: "u1",
      name: "ci",
      scopes: ["read:profile"],
      organizationId: null,
      expiresInDays: 400,
    });
    expect(result.isFailure).toBe(true);
    expect(result.getError().code).toBe("API_TOKEN_EXPIRY_INVALID");
    expect(repo.insert).not.toHaveBeenCalled();
  });

  it("revokes nothing when the token belongs to someone else", async () => {
    const repo = makeRepo({
      findByIdForOwner: mock(async () =>
        Result.ok<Option<ApiTokenRecord>, ApiTokenError>(Option.none<ApiTokenRecord>()),
      ),
    });
    const result = await makeService(repo).revoke("tok1", { kind: "personal", userId: "u2" }, "u2");
    expect(result.isFailure).toBe(true);
    expect(result.getError().code).toBe("API_TOKEN_NOT_FOUND");
    expect(repo.revoke).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Visibility scope — the list must hold both scopes the create form offers,
// and nothing else. The repository is deliberately made leaky here: what is
// under test is the rule, not the WHERE clause that also encodes it.
// ---------------------------------------------------------------------------

function record(over: Partial<ApiTokenRecord>): ApiTokenRecord {
  return {
    id: "tok",
    userId: "user-1",
    organizationId: null,
    name: "ci",
    scopes: ["read:profile"],
    tokenHmac: "hmac",
    pepperVersion: 1,
    tokenStart: "clean_ab",
    lastUsedAt: null,
    expiresAt: null,
    revokedAt: null,
    revokedReason: null,
    createdAt: new Date("2024-01-01"),
    ...over,
  };
}

const MINE_PERSONAL = record({ id: "mine-personal", organizationId: null });
const MINE_ACTIVE_ORG = record({ id: "mine-active-org", organizationId: "org-active" });
const MINE_OTHER_ORG = record({ id: "mine-other-org", organizationId: "org-other" });
const THEIRS_PERSONAL = record({ id: "theirs-personal", userId: "user-2" });
const THEIRS_ACTIVE_ORG = record({
  id: "theirs-active-org",
  userId: "user-2",
  organizationId: "org-active",
});

const LEAKY_REPO_ROWS = [
  MINE_PERSONAL,
  MINE_ACTIVE_ORG,
  MINE_OTHER_ORG,
  THEIRS_PERSONAL,
  THEIRS_ACTIVE_ORG,
];

describe("ApiTokenService.list — visibility scope", () => {
  const leakyRepo = () =>
    makeRepo({
      listByOwner: mock(async () => Result.ok<ApiTokenRecord[], ApiTokenError>(LEAKY_REPO_ROWS)),
    });

  it("shows the caller's personal token alongside the active organization's", async () => {
    const result = await makeService(leakyRepo()).list({
      kind: "orgAndPersonal",
      userId: "user-1",
      organizationId: "org-active",
    });

    expect(result.isSuccess).toBe(true);
    expect(result.getValue().map((r) => r.id)).toEqual(["mine-personal", "mine-active-org"]);
  });

  it("never surfaces another organization's token nor another user's", async () => {
    const visible = (
      await makeService(leakyRepo()).list({
        kind: "orgAndPersonal",
        userId: "user-1",
        organizationId: "org-active",
      })
    )
      .getValue()
      .map((r) => r.id);

    expect(visible).not.toContain("mine-other-org");
    expect(visible).not.toContain("theirs-personal");
    expect(visible).not.toContain("theirs-active-org");
  });

  it("shows only org-less tokens when the session carries no active organization", async () => {
    const result = await makeService(leakyRepo()).list({ kind: "personal", userId: "user-1" });

    expect(result.getValue().map((r) => r.id)).toEqual(["mine-personal"]);
  });
});

describe("ApiTokenService.revoke — visibility scope", () => {
  const repoReturning = (found: ApiTokenRecord) =>
    makeRepo({
      findByIdForOwner: mock(async () =>
        Result.ok<Option<ApiTokenRecord>, ApiTokenError>(Option.some(found)),
      ),
    });

  it("revokes a personal token while an organization is active", async () => {
    const repo = repoReturning(MINE_PERSONAL);

    const result = await makeService(repo).revoke(
      "mine-personal",
      { kind: "orgAndPersonal", userId: "user-1", organizationId: "org-active" },
      "user-1",
    );

    expect(result.isSuccess).toBe(true);
    expect(repo.revoke).toHaveBeenCalled();
  });

  it("reports a token from another organization absent rather than forbidden", async () => {
    const repo = repoReturning(MINE_OTHER_ORG);

    const result = await makeService(repo).revoke(
      "mine-other-org",
      { kind: "orgAndPersonal", userId: "user-1", organizationId: "org-active" },
      "user-1",
    );

    expect(result.isFailure).toBe(true);
    expect(result.getError().code).toBe("API_TOKEN_NOT_FOUND");
    expect(repo.revoke).not.toHaveBeenCalled();
  });

  it("reports another user's personal token absent rather than forbidden", async () => {
    const repo = repoReturning(THEIRS_PERSONAL);

    const result = await makeService(repo).revoke(
      "theirs-personal",
      { kind: "orgAndPersonal", userId: "user-1", organizationId: "org-active" },
      "user-1",
    );

    expect(result.isFailure).toBe(true);
    expect(result.getError().code).toBe("API_TOKEN_NOT_FOUND");
    expect(repo.revoke).not.toHaveBeenCalled();
  });
});
