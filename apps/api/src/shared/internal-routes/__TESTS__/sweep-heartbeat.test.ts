import { describe, expect, it } from "bun:test";
import { Result } from "@packages/ddd-kit";
import { mockPort } from "@packages/test/bun";
import type { ISweepRunStore, SweepRun } from "../../ports/sweep-run.port";
import { NoOpInstrumentation } from "../../services/noop-instrumentation";
import { withSweepHeartbeat } from "../sweep-heartbeat";
import type { SweepResponse } from "../sweep-runner";
import { sweepSpans } from "../sweep-span";

const COMPLETED: SweepResponse = {
  deleted: 7,
  durationMs: 12,
  dryRun: false,
  batchCount: 1,
  deletedPerPass: { default: 7 },
  stopReasons: { default: "exhausted" },
  truncated: false,
  skipped: false,
};

function setup() {
  const store = mockPort<ISweepRunStore>();
  store.record.mockImplementation(async () => Result.ok());
  const written = () => store.record.mock.calls.map(([run]: [SweepRun]) => run);

  return { store, written, spans: sweepSpans(new NoOpInstrumentation()) };
}

describe("sweep heartbeat", () => {
  it("records the outcome and the count of a completed run", async () => {
    const { store, written, spans } = setup();

    await withSweepHeartbeat({ label: "sweep-x", store, spans }, async () => COMPLETED);

    expect(written()).toMatchObject([{ label: "sweep-x", outcome: "ok", count: 7 }]);
  });

  it("reads a batch error as such, never as a healthy run", async () => {
    const { store, written, spans } = setup();

    await withSweepHeartbeat({ label: "sweep-x", store, spans }, async () => ({
      ...COMPLETED,
      stopReasons: { default: "batch-error" },
    }));

    expect(written()).toMatchObject([{ outcome: "batch-error" }]);
  });

  it("leaves the last real run in place when the run was refused the lease or dry", async () => {
    const { store, written, spans } = setup();

    await withSweepHeartbeat({ label: "sweep-x", store, spans }, async () => ({
      ...COMPLETED,
      skipped: true,
    }));
    await withSweepHeartbeat({ label: "sweep-x", store, spans }, async () => ({
      ...COMPLETED,
      dryRun: true,
    }));

    expect(written()).toEqual([]);
  });

  it("records a run that threw as failed and lets the error through", async () => {
    const { store, written, spans } = setup();
    const boom = new Error("boom");

    const run = withSweepHeartbeat({ label: "sweep-x", store, spans }, async () => {
      throw boom;
    });

    await expect(run).rejects.toBe(boom);
    expect(written()).toMatchObject([{ outcome: "failed", count: 0 }]);
  });

  it("never fails the sweep when the heartbeat cannot be written", async () => {
    const { store, spans } = setup();
    store.record.mockImplementation(async () => {
      throw new Error("database down");
    });

    const response = await withSweepHeartbeat(
      { label: "sweep-x", store, spans },
      async () => COMPLETED,
    );

    expect(response).toBe(COMPLETED);
  });
});
