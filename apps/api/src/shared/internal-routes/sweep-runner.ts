import type { PinoLogger } from "hono-pino";
import { z } from "zod";
import type { SweepSpans } from "./sweep-span";

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
  spans: SweepSpans;
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

export type SweepLock = {
  acquire: () => Promise<boolean>;
  release: () => Promise<void>;
};

export type RunRetentionSweepOptions = {
  body: SweepBody;
  passes: RetentionPass[];
  logger: PinoLogger;
  label: string;
  deadlineMs?: number;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
  lock: SweepLock;
  spans: SweepSpans;
};

export type SweepResponse = {
  deleted: number;
  durationMs: number;
  dryRun: boolean;
  batchCount: number;
  deletedPerPass: Record<string, number>;
  stopReasons: Record<string, SweepStopReason>;
  truncated: boolean;
  skipped: boolean;
};

export async function runRetentionSweep(opts: RunRetentionSweepOptions): Promise<SweepResponse> {
  return opts.spans.span({ name: `sweep > ${opts.label}`, op: "sweep" }, async () => {
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

    if (!(await opts.lock.acquire())) {
      opts.logger.warn(
        { label: opts.label },
        `${opts.label} skipped — another run holds the lease`,
      );
      // Written before returning: without it, a run refused the lease is
      // indistinguishable in the trace from a run that executed and found nothing.
      opts.spans.attributes({ "sweep.skipped": true });
      return {
        deleted: 0,
        durationMs: now() - startMs,
        dryRun,
        batchCount: 0,
        deletedPerPass: {},
        stopReasons: {},
        truncated: false,
        skipped: true,
      };
    }

    // One absolute deadline for the whole request, shared by every pass: the budget
    // exists to keep the response inside the server's idleTimeout, and that is a
    // property of the request, not of an individual pass.
    const deadlineAt = startMs + (opts.deadlineMs ?? DEFAULT_SWEEP_DEADLINE_MS);

    let deleted = 0;
    let batchCount = 0;
    const deletedPerPass: Record<string, number> = {};
    const stopReasons: Record<string, SweepStopReason> = {};

    try {
      // Sequential on purpose: each pass may loop hundreds of batched transactions, and
      // running passes in parallel halves the connection-pool headroom left for prod traffic.
      for (const pass of opts.passes) {
        // Cutoff is relative to the request's start, not to whenever this pass happens to
        // run: reading `now()` again here would burn a clock tick per pass for no benefit
        // (the deadline check below is what actually protects the budget) and would let a
        // slow earlier pass drift every later pass's retention window.
        const cutoff = new Date(startMs - pass.retentionDays * 24 * 60 * 60 * 1000);
        const run = await opts.spans.span(
          {
            name: `sweep > ${opts.label}:${pass.label}`,
            op: "sweep.pass",
            attributes: {
              "sweep.retention_days": pass.retentionDays,
              "sweep.batch_size": batchSize,
              "sweep.dry_run": dryRun,
            },
          },
          async () => {
            const result = await runBatchedSweep({
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
              spans: opts.spans,
            });
            // Written as the span closes: a pass that ran 40s tells you nothing on its
            // own — whether it finished or was cut by the budget is the whole signal.
            opts.spans.attributes({
              "sweep.deleted": result.deleted,
              "sweep.batch_count": result.batchCount,
              "sweep.stop_reason": result.stopReason,
            });
            return result;
          },
        );
        deleted += run.deleted;
        batchCount += run.batchCount;
        deletedPerPass[pass.label] = run.deleted;
        stopReasons[pass.label] = run.stopReason;
      }
    } finally {
      try {
        await opts.lock.release();
      } catch (err) {
        opts.logger.error({ err, label: opts.label }, "lease release failed");
        // Swallowed on purpose — a failed release must not fail a sweep that did its
        // work, and the lease expires on its own. Swallowed *silently* is the bug:
        // a label that keeps failing to release is invisible until it wedges.
        opts.spans.capture(err, { label: opts.label, phase: "lease-release" });
      }
    }

    const truncated = Object.values(stopReasons).some((r) => r === "budget" || r === "batch-cap");
    const durationMs = now() - startMs;
    opts.logger.info(
      { deleted, deletedPerPass, stopReasons, durationMs, batchCount, dryRun, truncated },
      `${opts.label} done`,
    );

    // Same reasoning as the skipped-run attributes above, for the completed path: the
    // run span otherwise carries no attributes of its own, only its `sweep.pass` children.
    opts.spans.attributes({
      "sweep.deleted": deleted,
      "sweep.batch_count": batchCount,
      "sweep.truncated": truncated,
    });

    return {
      deleted,
      durationMs,
      dryRun,
      batchCount,
      deletedPerPass,
      stopReasons,
      truncated,
      skipped: false,
    };
  });
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
      // Only the swallowing branch reports: a rethrown error reaches `app.onError`,
      // which already captures it — capturing here too would double-report it.
      if (decision === "throw") throw err;
      opts.spans.capture(err, {
        label: opts.label,
        batchCount,
        deleted: totalDeleted,
        phase: "purge-batch",
      });
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
