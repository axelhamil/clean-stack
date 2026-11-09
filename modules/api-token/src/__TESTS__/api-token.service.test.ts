import { describe, expect, it } from "bun:test";
import { Option, Result } from "@packages/ddd-kit";
import { EventTypes } from "@packages/events";
import type { IOutboxRepository } from "@packages/outbox/outbox.port";
import { enqueuedEvents } from "@packages/outbox/testing/enqueued-events";
import { mockPort } from "@packages/test/bun";
import { mockInstrumentation } from "@packages/test/bun/instrumentation";
import { mockUnitOfWork } from "@packages/test/bun/unit-of-work";
import type { ApiTokenRecord, IApiTokenRepository } from "../application/ports/api-token.port";
import { ApiTokenService } from "../application/services/api-token.service";

function makeRepo() {
  const repo = mockPort<IApiTokenRepository>();
  repo.insert.mockResolvedValue(Result.ok());
  repo.listByOwner.mockResolvedValue(Result.ok([]));
  repo.findByIdForOwner.mockResolvedValue(Result.ok(Option.none()));
  repo.revoke.mockResolvedValue(Result.ok(true));
  return repo;
}

function makeOutbox() {
  const outbox = mockPort<IOutboxRepository>();
  outbox.enqueue.mockResolvedValue(undefined);
  return outbox;
}

function makeService(repo = makeRepo(), outbox = makeOutbox()) {
  return new ApiTokenService(repo, outbox, mockUnitOfWork().unitOfWork, mockInstrumentation(), {
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
    const repo = makeRepo();
    const result = await makeService(repo).revoke("tok1", { kind: "personal", userId: "u2" }, "u2");
    expect(result.isFailure).toBe(true);
    expect(result.getError().code).toBe("API_TOKEN_NOT_FOUND");
    expect(repo.revoke).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Visibility scope: the list must hold both scopes the create form offers,
// and nothing else. The repository is deliberately made leaky here: what is
// under test is the rule, not the WHERE clause that also encodes it.
// ---------------------------------------------------------------------------

function record(over: Partial<ApiTokenRecord>): ApiTokenRecord {
  return {
    id: "tok",
    userId: "user-1",
    organizationId: Option.none(),
    name: "ci",
    scopes: ["read:profile"],
    tokenHmac: "hmac",
    pepperVersion: 1,
    tokenStart: "clean_ab",
    lastUsedAt: Option.none(),
    expiresAt: Option.none(),
    revokedAt: Option.none(),
    revokedReason: Option.none(),
    createdAt: new Date("2024-01-01"),
    ...over,
  };
}

const MINE_PERSONAL = record({ id: "mine-personal", organizationId: Option.none() });
const MINE_ACTIVE_ORG = record({
  id: "mine-active-org",
  organizationId: Option.some("org-active"),
});
const MINE_OTHER_ORG = record({ id: "mine-other-org", organizationId: Option.some("org-other") });
const THEIRS_PERSONAL = record({ id: "theirs-personal", userId: "user-2" });
const THEIRS_ACTIVE_ORG = record({
  id: "theirs-active-org",
  userId: "user-2",
  organizationId: Option.some("org-active"),
});

const LEAKY_REPO_ROWS = [
  MINE_PERSONAL,
  MINE_ACTIVE_ORG,
  MINE_OTHER_ORG,
  THEIRS_PERSONAL,
  THEIRS_ACTIVE_ORG,
];

describe("ApiTokenService.list: visibility scope", () => {
  const leakyRepo = () => {
    const repo = makeRepo();
    repo.listByOwner.mockResolvedValue(Result.ok(LEAKY_REPO_ROWS));
    return repo;
  };

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

describe("ApiTokenService.revoke: visibility scope", () => {
  const repoReturning = (found: ApiTokenRecord) => {
    const repo = makeRepo();
    repo.findByIdForOwner.mockResolvedValue(Result.ok(Option.some(found)));
    return repo;
  };

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

describe("ApiTokenService.revoke: already revoked", () => {
  const owner = { kind: "personal", userId: "user-1" } as const;

  it("writes nothing and announces nothing when the token was revoked before", async () => {
    const repo = makeRepo();
    repo.findByIdForOwner.mockResolvedValue(
      Result.ok(Option.some({ ...MINE_PERSONAL, revokedAt: Option.some(new Date("2024-06-01")) })),
    );
    const outbox = makeOutbox();

    const result = await makeService(repo, outbox).revoke("mine-personal", owner, "user-1");

    expect(result.isSuccess).toBe(true);
    expect(repo.revoke).not.toHaveBeenCalled();
    expect(enqueuedEvents(outbox)).toEqual([]);
  });

  it("announces nothing when a concurrent revocation won the write", async () => {
    const repo = makeRepo();
    repo.findByIdForOwner.mockResolvedValue(Result.ok(Option.some(MINE_PERSONAL)));
    repo.revoke.mockResolvedValue(Result.ok(false));
    const outbox = makeOutbox();

    const result = await makeService(repo, outbox).revoke("mine-personal", owner, "user-1");

    expect(result.isSuccess).toBe(true);
    expect(enqueuedEvents(outbox)).toEqual([]);
  });

  it("announces the revocation of a live token once", async () => {
    const repo = makeRepo();
    repo.findByIdForOwner.mockResolvedValue(Result.ok(Option.some(MINE_PERSONAL)));
    const outbox = makeOutbox();

    await makeService(repo, outbox).revoke("mine-personal", owner, "user-1");

    expect(enqueuedEvents(outbox).map((e) => e.eventType)).toEqual([EventTypes.API_TOKEN_REVOKED]);
  });
});
