import { describe, expect, it, mock } from "bun:test";
import type { Logger } from "../../../shared/logger";
import { NoOpInstrumentation } from "../../../shared/services/noop-instrumentation";
import { DrizzleRgpdRepository } from "../infrastructure/repositories/drizzle-rgpd.repository";

function selectReturning(rows: unknown[]) {
  const query = { toSQL: () => ({ sql: "select secret" }), execute: async () => rows };

  return { select: () => ({ from: () => ({ where: () => ({ limit: () => query }) }) }) } as never;
}

describe("DrizzleRgpdRepository.verifyTotp", () => {
  it("rejects the code and reports the error when the stored secret cannot be decrypted", async () => {
    const capture = mock(() => undefined);
    const instrumentation = Object.assign(new NoOpInstrumentation(), { capture });
    const repo = new DrizzleRgpdRepository(
      { error: () => {} } as unknown as Logger,
      instrumentation,
    );

    const result = await repo.verifyTotp(
      "u1",
      "123456",
      selectReturning([{ secret: "not-an-encrypted-secret" }]),
    );

    expect(result.getValue()).toBe(false);
    expect(capture).toHaveBeenCalledTimes(1);
  });
});
