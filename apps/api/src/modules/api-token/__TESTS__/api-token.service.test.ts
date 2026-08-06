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
    touchLastUsed: mock(async () => Result.ok()),
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
    expect(result.getError().code).toBe("API_TOKEN_EXPIRY_TOO_LONG");
    expect(repo.insert).not.toHaveBeenCalled();
  });

  it("revokes nothing when the token belongs to someone else", async () => {
    const repo = makeRepo({
      findByIdForOwner: mock(async () =>
        Result.ok<Option<ApiTokenRecord>, ApiTokenError>(Option.none<ApiTokenRecord>()),
      ),
    });
    const result = await makeService(repo).revoke(
      "tok1",
      { userId: "u2", organizationId: null },
      "u2",
    );
    expect(result.isFailure).toBe(true);
    expect(result.getError().code).toBe("API_TOKEN_NOT_FOUND");
    expect(repo.revoke).not.toHaveBeenCalled();
  });
});
