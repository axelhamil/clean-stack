import { beforeEach, describe, expect, it, mock } from "bun:test";
import * as realDrizzle from "@packages/drizzle";
import { mockInstrumentation } from "@packages/test/bun/instrumentation";
import type { TokenOwner } from "../../../domain/api-token/services/token-visibility.service";

const row = (
  id: string,
  userId: string,
  organizationId: string | null,
  scopes: unknown = ["read:profile"],
) => ({
  id,
  userId,
  organizationId,
  name: "ci",
  scopes,
  tokenHmac: "hmac",
  pepperVersion: 1,
  tokenStart: "clean_ab",
  lastUsedAt: null,
  expiresAt: null,
  revokedAt: null,
  revokedReason: null,
  createdAt: new Date("2024-01-01"),
  updatedAt: new Date("2024-01-01"),
});

const LEAKY_ROWS = [
  row("mine-personal", "user-1", null),
  row("mine-active-org", "user-1", "org-active"),
  row("mine-other-org", "user-1", "org-other"),
  row("theirs-personal", "user-2", null),
  row("theirs-active-org", "user-2", "org-active"),
];

function leakyQuery(): Record<string, unknown> {
  return {
    from: () => leakyQuery(),
    where: () => leakyQuery(),
    toSQL: () => ({ sql: "select", params: [] }),
    execute: async () => rows,
  };
}

let rows: unknown[] = LEAKY_ROWS;

const fakeDb = { select: () => leakyQuery() };

mock.module("@packages/drizzle", () => ({
  ...realDrizzle,
  db: fakeDb,
  resolveExecutor: () => fakeDb,
}));

const { DrizzleListApiTokensQuery } = await import("../../../infra/queries/list-api-tokens.query");

const IN_ACTIVE_ORG: TokenOwner = {
  kind: "orgAndPersonal",
  userId: "user-1",
  organizationId: "org-active",
};

let query = new DrizzleListApiTokensQuery(mockInstrumentation());

const idsFor = async (owner: TokenOwner) =>
  (await query.execute({ owner })).getValue().map((token) => token.id.value);

describe("DrizzleListApiTokensQuery: a leaky WHERE never leaks past the second gate", () => {
  beforeEach(() => {
    query = new DrizzleListApiTokensQuery(mockInstrumentation());
    rows = LEAKY_ROWS;
  });

  it("shows the caller's personal token alongside the active organization's, and nothing else", async () => {
    expect(await idsFor(IN_ACTIVE_ORG)).toEqual(["mine-personal", "mine-active-org"]);
  });

  it("shows only org-less tokens when the session carries no active organization", async () => {
    expect(await idsFor({ kind: "personal", userId: "user-1" })).toEqual(["mine-personal"]);
  });
});

describe("DrizzleListApiTokensQuery: a corrupt row fails typed instead of crashing", () => {
  it.each([
    ["a scope string instead of a list", "read:profile"],
    ["no scopes at all", null],
    ["an unknown scope", ["admin:all"]],
  ])("reports a provider failure for %s", async (_, scopes) => {
    rows = [row("corrupt", "user-1", null, scopes)];

    const result = await new DrizzleListApiTokensQuery(mockInstrumentation()).execute({
      owner: IN_ACTIVE_ORG,
    });

    expect(result.getError().code).toBe("API_TOKEN_PROVIDER_FAILURE");
  });
});
