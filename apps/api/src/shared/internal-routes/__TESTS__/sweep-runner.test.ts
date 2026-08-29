import { describe, expect, it } from "bun:test";
import { runRetentionSweep } from "../sweep-runner";

const logger = { info: () => {}, warn: () => {}, error: () => {} } as never;

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
      passes: [pass("sent", 7), pass("failed", 90)],
      logger,
      label: "sweep-x",
    });

    expect(cutoffs.sent?.getTime()).toBeGreaterThan(cutoffs.failed?.getTime() ?? 0);
  });
});
