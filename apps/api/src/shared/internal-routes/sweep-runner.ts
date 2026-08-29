import type { PinoLogger } from "hono-pino";
import { z } from "zod";

export const MAX_BATCHES = 1000;
export const INTER_BATCH_SLEEP_MS = 50;
export const DEFAULT_SWEEP_DEADLINE_MS = 90_000;

export const sweepBodySchema = z
  .object({
    batchSize: z.number().int().min(1).max(50000).optional(),
    dryRun: z.boolean().optional(),
  })
  .default({});

export type SweepBody = z.infer<typeof sweepBodySchema>;

export type SweepBatchErrorDecision = "break" | "throw";

/**
 * Why a sweep stopped. `budget` and `batch-cap` both mean "there is more work
 * left, come back next tick"; `batch-error` means a batch failed and will fail
 * again — collapsing the two into one flag makes a recurring data error read as
 * a healthy backlog.
 */
export type SweepStopReason = "exhausted" | "budget" | "batch-cap" | "batch-error";

export type RunBatchedSweepOptions = {
  purgeBatch: (batchSize: number) => Promise<number>;
  countEligible: () => Promise<number>;
  batchSize: number;
  dryRun: boolean;
  logger: PinoLogger;
  label: string;
  onBatchError?: (err: unknown) => SweepBatchErrorDecision;
  deadlineAt?: number;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
};

export type SweepRunResult = {
  deleted: number;
  batchCount: number;
  stopReason: SweepStopReason;
};

export type RetentionPass = {
  label: string;
  retentionDays: number;
  purgeBatch: (cutoff: Date, batchSize: number) => Promise<number>;
  countEligible: (cutoff: Date) => Promise<number>;
  onBatchError?: (err: unknown) => SweepBatchErrorDecision;
};

export type RunRetentionSweepOptions = {
  body: SweepBody;
  passes: RetentionPass[];
  logger: PinoLogger;
  label: string;
  deadlineMs?: number;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
};

export type SweepResponse = {
  deleted: number;
  durationMs: number;
  dryRun: boolean;
  batchCount: number;
  deletedPerPass: Record<string, number>;
  stopReasons: Record<string, SweepStopReason>;
  truncated: boolean;
};

export async function runRetentionSweep(opts: RunRetentionSweepOptions): Promise<SweepResponse> {
  const batchSize = opts.body.batchSize ?? 5000;
  const dryRun = opts.body.dryRun ?? false;
  const now = opts.now ?? Date.now;
  const startMs = now();

  opts.logger.info(
    {
      passes: opts.passes.map((p) => ({ label: p.label, retentionDays: p.retentionDays })),
      batchSize,
      dryRun,
    },
    `${opts.label} started`,
  );

  // One absolute deadline for the whole request, shared by every pass: the budget
  // exists to keep the response inside the server's idleTimeout, and that is a
  // property of the request, not of an individual pass.
  const deadlineAt = startMs + (opts.deadlineMs ?? DEFAULT_SWEEP_DEADLINE_MS);

  let deleted = 0;
  let batchCount = 0;
  const deletedPerPass: Record<string, number> = {};
  const stopReasons: Record<string, SweepStopReason> = {};

  // Sequential on purpose: each pass may loop hundreds of batched transactions, and
  // running passes in parallel halves the connection-pool headroom left for prod traffic.
  for (const pass of opts.passes) {
    // Cutoff is relative to the request's start, not to whenever this pass happens to
    // run: reading `now()` again here would burn a clock tick per pass for no benefit
    // (the deadline check below is what actually protects the budget) and would let a
    // slow earlier pass drift every later pass's retention window.
    const cutoff = new Date(startMs - pass.retentionDays * 24 * 60 * 60 * 1000);
    const run = await runBatchedSweep({
      purgeBatch: (size) => pass.purgeBatch(cutoff, size),
      countEligible: () => pass.countEligible(cutoff),
      batchSize,
      dryRun,
      logger: opts.logger,
      label: `${opts.label}:${pass.label}`,
      onBatchError: pass.onBatchError,
      deadlineAt,
      now,
      sleep: opts.sleep,
    });
    deleted += run.deleted;
    batchCount += run.batchCount;
    deletedPerPass[pass.label] = run.deleted;
    stopReasons[pass.label] = run.stopReason;
  }

  const truncated = Object.values(stopReasons).some((r) => r === "budget" || r === "batch-cap");
  const durationMs = now() - startMs;
  opts.logger.info(
    { deleted, deletedPerPass, stopReasons, durationMs, batchCount, dryRun, truncated },
    `${opts.label} done`,
  );

  return { deleted, durationMs, dryRun, batchCount, deletedPerPass, stopReasons, truncated };
}

export async function runBatchedSweep(opts: RunBatchedSweepOptions): Promise<SweepRunResult> {
  const now = opts.now ?? Date.now;
  const sleep =
    opts.sleep ??
    // biome-ignore lint/correctness/noUndeclaredVariables: Bun global available at runtime
    Bun.sleep;

  if (opts.dryRun) {
    return { deleted: await opts.countEligible(), batchCount: 0, stopReason: "exhausted" };
  }

  let totalDeleted = 0;
  let batchCount = 0;
  let stopReason: SweepStopReason = "exhausted";

  while (batchCount < MAX_BATCHES) {
    // Checked between batches only: a started batch owns an open transaction, and each
    // purgeBatch is already capped by its own `SET LOCAL statement_timeout = '5s'`.
    if (opts.deadlineAt !== undefined && now() >= opts.deadlineAt) {
      stopReason = "budget";
      // A pass reached with the budget already spent is never entered: no purgeBatch
      // call happened yet, so this reads as "skipped" rather than "stopped mid-run".
      if (batchCount === 0) {
        opts.logger.warn(
          { label: opts.label },
          `${opts.label} skipped — time budget already spent`,
        );
      } else {
        opts.logger.warn(
          { label: opts.label, deleted: totalDeleted, batchCount },
          `${opts.label} hit the time budget — stopping early`,
        );
      }
      break;
    }

    let deletedInBatch: number;
    try {
      deletedInBatch = await opts.purgeBatch(opts.batchSize);
    } catch (err) {
      const decision = opts.onBatchError?.(err) ?? "throw";
      if (decision === "throw") throw err;
      stopReason = "batch-error";
      opts.logger.warn(
        { err, label: opts.label, deleted: totalDeleted, batchCount },
        `${opts.label} stopped on a batch error`,
      );
      break;
    }

    totalDeleted += deletedInBatch;
    batchCount++;

    if (deletedInBatch === 0) break;

    if (batchCount < MAX_BATCHES) {
      await sleep(INTER_BATCH_SLEEP_MS);
    }
  }

  if (stopReason === "exhausted" && batchCount >= MAX_BATCHES) {
    stopReason = "batch-cap";
    opts.logger.warn(
      { batchCount: MAX_BATCHES, label: opts.label },
      `${opts.label} hit batch cap — stopping early`,
    );
  }

  return { deleted: totalDeleted, batchCount, stopReason };
}
