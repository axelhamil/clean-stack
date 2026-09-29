import { mock } from "bun:test";

const realDrizzle = await import("@packages/drizzle");

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
  ...realDrizzle,
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
const { purgeBatchWithTimeout, requireFilter } = await import("../sweep-purge");
const { isNotNull } = await import("@packages/drizzle");

// A present predicate, mirroring what every route passes: `where: undefined` would be
// refused by the guard `purgeBatchWithTimeout` fails closed on.
const someWhere = () => isNotNull({} as never) as never;

describe("purgeBatchWithTimeout", () => {
  it("returns the number of deleted rows", async () => {
    const spans = sweepSpans(new NoOpInstrumentation());
    const deleted = await purgeBatchWithTimeout({
      table: {} as never,
      idColumn: {} as never,
      where: someWhere(),
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
      where: someWhere(),
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

describe("requireFilter", () => {
  it("returns the filter unchanged when given one", () => {
    const filter = someWhere();
    expect(requireFilter(filter, "some-label")).toBe(filter);
  });

  it("throws with the label in the message when given undefined", () => {
    expect(() => requireFilter(undefined, "sweep-consents")).toThrow(
      "sweep-consents: refusing a sweep filter that resolved to no predicate",
    );
  });
});
