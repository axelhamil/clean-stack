import { describe, expect, it, spyOn } from "bun:test";
import { NoOpInstrumentation } from "../../services/noop-instrumentation";
import { sweepSpans } from "../sweep-span";

describe("sweepSpans", () => {
  it("opens a named span and returns the callback's value", async () => {
    const instrumentation = new NoOpInstrumentation();
    const spy = spyOn(instrumentation, "startSpan");
    const spans = sweepSpans(instrumentation);

    const result = await spans.span({ name: "sweep > sweep-x", op: "sweep" }, async () => 42);

    expect(result).toBe(42);
    expect(spy).toHaveBeenCalledWith(
      expect.objectContaining({ name: "sweep > sweep-x", op: "sweep" }),
      expect.any(Function),
    );
  });

  it("tags db spans with the sql and the postgres attribute", async () => {
    const instrumentation = new NoOpInstrumentation();
    const spy = spyOn(instrumentation, "startSpan");
    const spans = sweepSpans(instrumentation);

    await spans.db('delete from "audit_log"', async () => 3);

    expect(spy).toHaveBeenCalledWith(
      {
        name: 'delete from "audit_log"',
        op: "db.query",
        attributes: { "db.system.name": "postgresql" },
      },
      expect.any(Function),
    );
  });

  it("stops opening db spans past the budget but still runs the query", async () => {
    const instrumentation = new NoOpInstrumentation();
    const spy = spyOn(instrumentation, "startSpan");
    const spans = sweepSpans(instrumentation, 2);

    const results: number[] = [];
    for (let i = 0; i < 5; i++) results.push(await spans.db("delete from t", async () => i));

    expect(results).toEqual([0, 1, 2, 3, 4]);
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it("keeps a separate budget per instance", async () => {
    const instrumentation = new NoOpInstrumentation();
    const spy = spyOn(instrumentation, "startSpan");

    await sweepSpans(instrumentation, 1).db("delete from t", async () => 0);
    await sweepSpans(instrumentation, 1).db("delete from t", async () => 0);

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
