import { beforeEach, describe, expect, it, mock } from "bun:test";
import type { ILogger } from "@packages/ddd-kit";
import * as realDrizzle from "@packages/drizzle";
import { mockPort } from "@packages/test/bun";
import { mockInstrumentation } from "@packages/test/bun/instrumentation";
import type { auditLog } from "../../../../schemas/audit-log";

type ListedRow = { row: typeof auditLog.$inferSelect; cursorAt: string };

const selectExecute = mock(async (): Promise<ListedRow[]> => []);

const select = () => {
  const chain = {
    from: () => chain,
    where: () => chain,
    orderBy: () => chain,
    limit: () => chain,
    toSQL: () => ({ sql: "select" }),
    execute: selectExecute,
  };
  return chain;
};

mock.module("@packages/drizzle", () => ({
  ...realDrizzle,
  resolveExecutor: () => ({ select }),
}));

const { DrizzleListAuditEventsQuery } = await import(
  "../../../infra/queries/list-audit-events.query"
);

function listed(id: string, cursorAt: string): ListedRow {
  return {
    row: {
      id,
      sequence: 1,
      action: "x",
      actorId: "u1",
      actorType: "user",
      organizationId: "org-1",
      targetType: "user",
      targetId: "u2",
      metadata: {},
      requestId: null,
      retention: "compliance",
      occurredAt: new Date("2024-01-01"),
      prevHash: null,
      hash: null,
    },
    cursorAt,
  };
}

function query() {
  return new DrizzleListAuditEventsQuery(mockInstrumentation(), mockPort<ILogger>());
}

describe("list audit events", () => {
  beforeEach(() => {
    selectExecute.mockReset();
  });

  it("returns an empty page with no cursor when nothing matches", async () => {
    selectExecute.mockResolvedValueOnce([]);

    const page = (await query().execute({})).getValue();

    expect(page.items).toEqual([]);
    expect(page.nextCursor.isNone()).toBe(true);
  });

  it("cuts the page at the limit and points the cursor at its last row", async () => {
    selectExecute.mockResolvedValueOnce([
      listed("r1", "2024-01-03 00:00:00.000001"),
      listed("r2", "2024-01-02 00:00:00.000001"),
      listed("r3", "2024-01-01 00:00:00.000001"),
    ]);

    const page = (await query().execute({ limit: 2 })).getValue();

    expect(page.items.map(({ id }) => id)).toEqual(["r1", "r2"]);
    expect(page.nextCursor.toNull()).toBe("2024-01-02 00:00:00.000001~r2");
  });

  it("fails with a persistence error when the read throws", async () => {
    selectExecute.mockRejectedValueOnce(new Error("db down"));

    const result = await query().execute({});

    expect(result.getError().code).toBe("AUDIT_PERSISTENCE_PROVIDER_FAILURE");
  });
});
