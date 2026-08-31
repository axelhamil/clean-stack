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

mock.module("@packages/drizzle", () => ({
  ...drizzleMock(),
  db: {
    transaction: async (fn: (tx: unknown) => Promise<unknown>) =>
      fn({
        execute: async () => {},
        select: () => fakeQuery("select id", []),
        delete: () => fakeQuery('delete from "t"', [{ id: "a" }, { id: "b" }]),
      }),
  },
}));

const { describe, expect, it, spyOn } = await import("bun:test");
const { NoOpInstrumentation } = await import("../../services/noop-instrumentation");
const { sweepSpans } = await import("../sweep-span");
const { purgeBatchWithTimeout } = await import("../sweep-purge");
const { isNotNull } = await import("@packages/drizzle");

// A real predicate, mirroring what every route actually passes — `where: undefined`
// would now be refused by the guard `purgeBatchWithTimeout` fails closed on.
const realWhere = () => isNotNull({} as never) as never;

describe("purgeBatchWithTimeout", () => {
  it("returns the number of deleted rows", async () => {
    const spans = sweepSpans(new NoOpInstrumentation());
    const deleted = await purgeBatchWithTimeout({
      table: {} as never,
      idColumn: {} as never,
      where: realWhere(),
      orderBy: {} as never,
      batchSize: 100,
      spans,
    });

    expect(deleted).toBe(2);
  });

  it("refuses an unfiltered delete", async () => {
    const spans = sweepSpans(new NoOpInstrumentation());

    await expect(
      purgeBatchWithTimeout({
        table: {} as never,
        idColumn: {} as never,
        where: undefined as never,
        orderBy: {} as never,
        batchSize: 100,
        spans,
      }),
    ).rejects.toThrow("refusing an unfiltered delete");
  });

  it("opens exactly one db span, carrying the delete sql", async () => {
    const instrumentation = new NoOpInstrumentation();
    const spy = spyOn(instrumentation, "startSpan");
    const spans = sweepSpans(instrumentation);

    await purgeBatchWithTimeout({
      table: {} as never,
      idColumn: {} as never,
      where: realWhere(),
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
