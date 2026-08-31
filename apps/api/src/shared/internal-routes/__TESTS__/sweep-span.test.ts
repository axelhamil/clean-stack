import { describe, expect, it, spyOn } from "bun:test";
import { NoOpInstrumentation } from "../../services/noop-instrumentation";
import { sweepSpans } from "../sweep-span";

describe("sweepSpans", () => {
  it("opens a named span and returns the callback's value", async () => {
    const instrumentation = new NoOpInstrumentation();
    const spy = spyOn(instrumentation, "startSpan");
    const spans = sweepSpans(instrumentation);

    const result = await spans.span({ name: "sweep > sweep-x", op: "function" }, async () => 42);

    expect(result).toBe(42);
    expect(spy).toHaveBeenCalledWith(
      expect.objectContaining({ name: "sweep > sweep-x", op: "function" }),
      expect.any(Function),
    );
  });

  it("tags db spans with the sql and the postgres attribute", async () => {
    const instrumentation = new NoOpInstrumentation();
    const spy = spyOn(instrumentation, "startSpan");
    const spans = sweepSpans(instrumentation);

    await spans.db(
      () => 'delete from "audit_log"',
      async () => 3,
    );

    expect(spy).toHaveBeenCalledWith(
      {
        name: 'delete from "audit_log"',
        op: "db.query",
        attributes: { "db.system.name": "postgresql" },
      },
      expect.any(Function),
    );
  });

  it("does not evaluate the sql thunk once the budget is exhausted", async () => {
    const instrumentation = new NoOpInstrumentation();
    const spans = sweepSpans(instrumentation, 1);
    let calls = 0;
    const sqlOf = () => {
      calls++;
      return "delete from t";
    };

    await spans.db(sqlOf, async () => 0);
    await spans.db(sqlOf, async () => 0);

    expect(calls).toBe(1);
  });

  it("stops opening db spans past the budget but still runs the query", async () => {
    const instrumentation = new NoOpInstrumentation();
    const spy = spyOn(instrumentation, "startSpan");
    const spans = sweepSpans(instrumentation, 2);

    const results: number[] = [];
    for (let i = 0; i < 5; i++)
      results.push(
        await spans.db(
          () => "delete from t",
          async () => i,
        ),
      );

    expect(results).toEqual([0, 1, 2, 3, 4]);
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it("keeps opening the lease span even past the exhausted db budget", async () => {
    const instrumentation = new NoOpInstrumentation();
    const spans = sweepSpans(instrumentation, 1);

    // Exhaust the budgeted db spans first.
    await spans.db(
      () => "delete from t",
      async () => 0,
    );
    await spans.db(
      () => "delete from t",
      async () => 0,
    );

    const spy = spyOn(instrumentation, "startSpan");
    await spans.lease(
      () => 'delete from "sweep_lock"',
      async () => undefined,
    );

    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith(
      {
        name: 'delete from "sweep_lock"',
        op: "db.query",
        attributes: { "db.system.name": "postgresql" },
      },
      expect.any(Function),
    );
  });

  it("keeps a separate budget per instance", async () => {
    const instrumentation = new NoOpInstrumentation();
    const spy = spyOn(instrumentation, "startSpan");

    // Built before either is used: a bug that backs `remaining` with module-level
    // state (reset per construction) would have both instances share one counter
    // from this point on, rather than each holding its own closure-scoped budget.
    const spansA = sweepSpans(instrumentation, 1);
    const spansB = sweepSpans(instrumentation, 1);

    let resolveA!: () => void;
    let resolveB!: () => void;
    const gateA = new Promise<void>((resolve) => {
      resolveA = resolve;
    });
    const gateB = new Promise<void>((resolve) => {
      resolveB = resolve;
    });

    // Both calls are in flight, interleaved, before either resolves.
    const callA = spansA.db(
      () => "delete from t",
      async () => {
        await gateA;
        return 0;
      },
    );
    const callB = spansB.db(
      () => "delete from t",
      async () => {
        await gateB;
        return 0;
      },
    );

    resolveB();
    resolveA();
    await Promise.all([callA, callB]);

    expect(spy).toHaveBeenCalledTimes(2);
  });

  it("passes captures through with their metadata", () => {
    const instrumentation = new NoOpInstrumentation();
    const spy = spyOn(instrumentation, "capture");
    const err = new Error("boom");

    sweepSpans(instrumentation).capture(err, { label: "sweep-x", batchCount: 3 });

    expect(spy).toHaveBeenCalledWith(err, {
      metadata: { label: "sweep-x", batchCount: 3 },
    });
  });
});
