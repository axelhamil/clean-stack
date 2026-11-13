import { describe, expect, it, mock } from "bun:test";
import { EventCollector, UnitOfWorkContext } from "@packages/ddd-kit";
import * as realDrizzle from "@packages/drizzle";
import { mockInstrumentation } from "@packages/test/bun/instrumentation";
import { apiToken } from "../../fixtures";

const update = mock(() => {
  throw new Error("no write expected");
});
const fakeDb = { update };

mock.module("@packages/drizzle", () => ({
  ...realDrizzle,
  db: fakeDb,
  resolveExecutor: () => fakeDb,
}));

const { DrizzleApiTokenRepository } = await import(
  "../../../infra/repos/drizzle/api-token.repository"
);

describe("DrizzleApiTokenRepository.revoke", () => {
  it("writes and hands over nothing for a token that was not revoked in memory", async () => {
    const token = apiToken();

    const result = await UnitOfWorkContext.run({}, async () => {
      const revoked = await new DrizzleApiTokenRepository(mockInstrumentation()).revoke(token);

      return { revoked, collected: EventCollector.drain() };
    });

    expect(result.revoked.getValue()).toBe(false);
    expect(result.collected).toEqual([]);
    expect(update).not.toHaveBeenCalled();
  });
});
