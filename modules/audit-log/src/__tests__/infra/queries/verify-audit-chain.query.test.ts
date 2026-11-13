import { beforeEach, describe, expect, it, mock } from "bun:test";
import { type ILogger, Option } from "@packages/ddd-kit";
import * as realDrizzle from "@packages/drizzle";
import { mockPort } from "@packages/test/bun";
import { mockInstrumentation } from "@packages/test/bun/instrumentation";
import type { auditLog } from "../../../../schemas/audit-log";
import { toAuditHashInput } from "../../../application/mappers/audit-hash-input.mapper";
import { GENESIS_HASH } from "../../../application/ports/services/audit-hasher.port";
import { sha256AuditHasher } from "../../../infra/adapters/sha256-audit-hasher.adapter";

type AuditLogRow = typeof auditLog.$inferSelect;

const selectExecute = mock(async (): Promise<AuditLogRow[]> => []);

const select = () => {
  const chain = {
    from: () => chain,
    where: () => chain,
    orderBy: () => chain,
    toSQL: () => ({ sql: "select" }),
    execute: selectExecute,
  };
  return chain;
};

mock.module("@packages/drizzle", () => ({
  ...realDrizzle,
  resolveExecutor: () => ({ select }),
}));

const { DrizzleVerifyAuditChainQuery } = await import(
  "../../../infra/queries/verify-audit-chain.query"
);

function chainRow(sequence: number, prevHash: string): AuditLogRow {
  const row = {
    id: `audit-${sequence}`,
    sequence,
    action: "user.created",
    actorId: null,
    actorType: "system" as const,
    organizationId: null,
    targetType: "user",
    targetId: `u${sequence}`,
    metadata: { n: sequence },
    occurredAt: new Date("2026-07-10T00:00:00.000Z"),
    requestId: null,
    retention: "compliance" as const,
    prevHash,
  };
  const hash = sha256AuditHasher.hash(
    toAuditHashInput(
      {
        ...row,
        actorId: Option.none(),
        organizationId: Option.none(),
        requestId: Option.none(),
      },
      prevHash,
    ),
  );

  return { ...row, hash };
}

function query() {
  return new DrizzleVerifyAuditChainQuery(
    sha256AuditHasher,
    mockInstrumentation(),
    mockPort<ILogger>(),
  );
}

describe("verify the audit chain", () => {
  beforeEach(() => {
    selectExecute.mockReset();
  });

  it("verifies a chain whose links and hashes all hold", async () => {
    const first = chainRow(1, GENESIS_HASH);
    selectExecute.mockResolvedValueOnce([first, chainRow(2, first.hash ?? "")]);

    const verification = (await query().execute()).getValue();

    expect(verification.verified).toBe(true);
    expect(verification.rowCount).toBe(2);
    expect(verification.brokenAtId.isNone()).toBe(true);
  });

  it("reports the first row whose stored fields no longer match its hash", async () => {
    const first = chainRow(1, GENESIS_HASH);
    const second = chainRow(2, first.hash ?? "");
    selectExecute.mockResolvedValueOnce([first, { ...second, targetId: "TAMPERED" }]);

    const verification = (await query().execute()).getValue();

    expect(verification.verified).toBe(false);
    expect(verification.brokenAtId.toNull()).toBe(second.id);
    expect(verification.brokenAtSequence.toNull()).toBe(2);
  });

  it("reports a row that does not link to its predecessor", async () => {
    const first = chainRow(1, GENESIS_HASH);
    selectExecute.mockResolvedValueOnce([first, chainRow(2, "someone-else")]);

    const verification = (await query().execute()).getValue();

    expect(verification.verified).toBe(false);
    expect(verification.brokenAtId.toNull()).toBe("audit-2");
  });
});
