import { describe, expect, it, mock } from "bun:test";
import { UnitOfWorkContext } from "@packages/ddd-kit";
import { mockInstrumentation } from "@packages/test/bun/instrumentation";
import { quotaUsage } from "../../../../schemas/quota-usage";
import { ScopedRowCounter } from "../../../infra/adapters/scoped-row-counter.adapter";

function countingExecutor(n: number) {
  const from = mock((_table: unknown) => ({
    where: () => ({ toSQL: () => ({ sql: "count query" }), execute: async () => [{ n }] }),
  }));

  return { from, executor: { select: () => ({ from }) } };
}

const tables = { projects: { table: quotaUsage, organizationColumn: quotaUsage.organizationId } };

describe("ScopedRowCounter", () => {
  it("given a table supplied by the host, when its quota is counted, then it counts the rows of that table", async () => {
    const { from, executor } = countingExecutor(3);
    const counter = new ScopedRowCounter(tables, mockInstrumentation());

    const result = await UnitOfWorkContext.run(executor, () => counter.count("org1", "projects"));

    expect(result.getValue()).toBe(3);
    expect(from).toHaveBeenCalledWith(quotaUsage);
  });

  it("given a resource the host supplied no table for, when it is counted, then it is not found", async () => {
    const counter = new ScopedRowCounter(tables, mockInstrumentation());

    const result = await counter.count("org1", "uploads");

    expect(result.getError().code).toBe("QUOTA_RESOURCE_NOT_FOUND");
  });
});
