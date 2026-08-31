import { mock } from "bun:test";
import { drizzleMock } from "./drizzle-mock";

const executed: string[] = [];

function fakeQuery(sql: string, rows: Array<{ id: string }>) {
  return {
    where: () => fakeQuery(sql, rows),
    orderBy: () => fakeQuery(sql, rows),
    limit: () => fakeQuery(sql, rows),
    for: () => fakeQuery(sql, rows),
    from: () => fakeQuery(sql, rows),
    returning: () => fakeQuery(sql, rows),
    toSQL: () => ({ sql }),
    execute: async () => {
      executed.push(sql);
      return rows;
    },
  };
}

const statements: string[] = [];

mock.module("@packages/drizzle", () => ({
  ...drizzleMock(),
  db: {
    transaction: async (fn: (tx: unknown) => Promise<unknown>) =>
      fn({
        execute: async (s: unknown) => {
          statements.push(String(s));
        },
        select: () => fakeQuery("select id", []),
        delete: () => fakeQuery('delete from "t"', [{ id: "a" }, { id: "b" }]),
      }),
  },
}));

const { describe, expect, it, spyOn } = await import("bun:test");
const { NoOpInstrumentation } = await import("../../services/noop-instrumentation");
const { sweepSpans } = await import("../sweep-span");
const { purgeBatchWithTimeout } = await import("../sweep-purge");

describe("purgeBatchWithTimeout", () => {
  it("returns the number of deleted rows", async () => {
    const spans = sweepSpans(new NoOpInstrumentation());
    const deleted = await purgeBatchWithTimeout({
      table: {} as never,
      idColumn: {} as never,
      where: undefined,
      orderBy: {} as never,
      batchSize: 100,
      spans,
    });

    expect(deleted).toBe(2);
  });

  it("keeps the three SET LOCAL guards", async () => {
    statements.length = 0;
    const spans = sweepSpans(new NoOpInstrumentation());
    await purgeBatchWithTimeout({
      table: {} as never,
      idColumn: {} as never,
      where: undefined,
      orderBy: {} as never,
      batchSize: 100,
      spans,
    });

    expect(statements.join(" ")).toContain("statement_timeout");
    expect(statements.join(" ")).toContain("lock_timeout");
    expect(statements.join(" ")).toContain("idle_in_transaction_session_timeout");
  });

  it("opens exactly one db span, carrying the delete sql", async () => {
    const instrumentation = new NoOpInstrumentation();
    const spy = spyOn(instrumentation, "startSpan");
    const spans = sweepSpans(instrumentation);

    await purgeBatchWithTimeout({
      table: {} as never,
      idColumn: {} as never,
      where: undefined,
      orderBy: {} as never,
      batchSize: 100,
      spans,
    });

    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'delete from "t"', op: "db.query" }),
      expect.any(Function),
    );
  });
});
