import { describe, expect, it } from "bun:test";
import { MAX_BATCHES, runRetentionSweep } from "../sweep-runner";

const logger = { info: () => {}, warn: () => {}, error: () => {} } as never;

// `lock` is required on `RunRetentionSweepOptions` — every route holds one, so a
// route that forgot it would no longer type-check. Tests that aren't exercising
// lease behavior pass this always-acquires no-op instead.
const noopLock = { acquire: async () => true, release: async () => {} };

describe("runRetentionSweep", () => {
  it("runs passes sequentially and reports each one", async () => {
    const order: string[] = [];
    const pass = (label: string, deleted: number) => ({
      label,
      retentionDays: 7,
      countEligible: async () => deleted,
      // First call for a label returns the batch; the second reports exhaustion so
      // runBatchedSweep stops looping. Without the second value the loop would run to
      // MAX_BATCHES.
      purgeBatch: async () => {
        order.push(label);
        return order.filter((l) => l === label).length === 1 ? deleted : 0;
      },
    });

    const result = await runRetentionSweep({
      body: {},
      lock: noopLock,
      passes: [pass("sent", 3), pass("failed", 2)],
      logger,
      label: "sweep-x",
    });

    expect(result.deleted).toBe(5);
    expect(result.deletedPerPass).toEqual({ sent: 3, failed: 2 });
    expect(order[0]).toBe("sent");
  });

  it("gives each pass its own cutoff", async () => {
    const cutoffs: Record<string, Date> = {};
    const pass = (label: string, days: number) => ({
      label,
      retentionDays: days,
      countEligible: async (cutoff: Date) => {
        cutoffs[label] = cutoff;
        return 0;
      },
      purgeBatch: async () => 0,
    });

    await runRetentionSweep({
      body: { dryRun: true },
      lock: noopLock,
      passes: [pass("sent", 7), pass("failed", 90)],
      logger,
      label: "sweep-x",
    });

    expect(cutoffs.sent?.getTime()).toBeGreaterThan(cutoffs.failed?.getTime() ?? 0);
  });
});

/** Deterministic clock: each read advances by `stepMs`, so no test sleeps. */
const fakeClock = (stepMs: number) => {
  let t = 0;
  return () => {
    const current = t;
    t += stepMs;
    return current;
  };
};

describe("runRetentionSweep — time budget", () => {
  it("stops between batches once the budget is spent and reports truncated", async () => {
    let calls = 0;

    const result = await runRetentionSweep({
      body: {},
      lock: noopLock,
      deadlineMs: 100,
      // Each clock read jumps 60ms: the first loop check sees 0 (batch runs), the
      // second sees 120 > 100 (budget spent).
      now: fakeClock(60),
      passes: [
        {
          label: "sent",
          retentionDays: 7,
          countEligible: async () => 0,
          purgeBatch: async () => {
            calls++;
            return 5;
          },
        },
      ],
      logger,
      label: "sweep-x",
    });

    expect(calls).toBe(1);
    expect(result.deleted).toBe(5);
    expect(result.truncated).toBe(true);
    expect(result.stopReasons.sent).toBe("budget");
  });

  it("skips a whole pass when the budget is already spent", async () => {
    const touched: string[] = [];
    const pass = (label: string) => ({
      label,
      retentionDays: 7,
      countEligible: async () => 0,
      purgeBatch: async () => {
        touched.push(label);
        return 1;
      },
    });

    const result = await runRetentionSweep({
      body: {},
      lock: noopLock,
      deadlineMs: 100,
      now: fakeClock(60),
      passes: [pass("sent"), pass("failed")],
      logger,
      label: "sweep-x",
    });

    expect(touched).toEqual(["sent"]);
    expect(result.deletedPerPass).toEqual({ sent: 1, failed: 0 });
    expect(result.stopReasons.failed).toBe("budget");
    expect(result.truncated).toBe(true);
  });

  it("reports exhausted and truncated: false when a pass drains inside the budget", async () => {
    const result = await runRetentionSweep({
      body: {},
      lock: noopLock,
      deadlineMs: 60_000,
      passes: [
        {
          label: "sent",
          retentionDays: 7,
          countEligible: async () => 0,
          purgeBatch: async () => 0,
        },
      ],
      logger,
      label: "sweep-x",
    });

    expect(result.truncated).toBe(false);
    expect(result.stopReasons.sent).toBe("exhausted");
  });

  it("treats the batch cap as truncation, not as a clean finish", async () => {
    const result = await runRetentionSweep({
      body: {},
      lock: noopLock,
      deadlineMs: 60_000,
      // The inter-batch sleep is stubbed out: this drives the loop through all
      // MAX_BATCHES iterations, which would otherwise take ~50s at
      // INTER_BATCH_SLEEP_MS against the 30s safety-net timeout on this `it`.
      sleep: async () => {},
      passes: [
        {
          label: "sent",
          retentionDays: 7,
          countEligible: async () => 0,
          // Never returns 0, so only MAX_BATCHES can end the loop.
          purgeBatch: async () => 1,
        },
      ],
      logger,
      label: "sweep-x",
    });

    expect(result.batchCount).toBe(MAX_BATCHES);
    expect(result.stopReasons.sent).toBe("batch-cap");
    expect(result.truncated).toBe(true);
  }, 30_000);

  it("reports a batch error distinctly from truncation", async () => {
    const result = await runRetentionSweep({
      body: {},
      lock: noopLock,
      deadlineMs: 60_000,
      passes: [
        {
          label: "sent",
          retentionDays: 7,
          countEligible: async () => 0,
          purgeBatch: async () => {
            throw new Error("fk violation");
          },
          onBatchError: () => "break" as const,
        },
      ],
      logger,
      label: "sweep-x",
    });

    expect(result.stopReasons.sent).toBe("batch-error");
    // A recurring data error must never read as a healthy backlog.
    expect(result.truncated).toBe(false);
  });
});

describe("runRetentionSweep — lease", () => {
  it("does no work and reports skipped when the lease is held", async () => {
    let purged = 0;

    const result = await runRetentionSweep({
      body: {},
      lock: { acquire: async () => false, release: async () => {} },
      passes: [
        {
          label: "sent",
          retentionDays: 7,
          countEligible: async () => 0,
          purgeBatch: async () => {
            purged++;
            return 1;
          },
        },
      ],
      logger,
      label: "sweep-x",
    });

    expect(purged).toBe(0);
    expect(result.skipped).toBe(true);
    expect(result.deleted).toBe(0);
  });

  it("releases the lease even when a pass throws", async () => {
    let released = false;

    const run = runRetentionSweep({
      body: {},
      lock: {
        acquire: async () => true,
        release: async () => {
          released = true;
        },
      },
      passes: [
        {
          label: "sent",
          retentionDays: 7,
          countEligible: async () => 0,
          purgeBatch: async () => {
            throw new Error("boom");
          },
        },
      ],
      logger,
      label: "sweep-x",
    });

    await expect(run).rejects.toThrow("boom");
    expect(released).toBe(true);
  });
});
