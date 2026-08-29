import type { PinoLogger } from "hono-pino";
import { z } from "zod";

export const MAX_BATCHES = 1000;
export const INTER_BATCH_SLEEP_MS = 50;

export const sweepBodySchema = z
  .object({
    batchSize: z.number().int().min(1).max(50000).optional(),
    dryRun: z.boolean().optional(),
  })
  .default({});

export type SweepBody = z.infer<typeof sweepBodySchema>;

export type SweepBatchErrorDecision = "break" | "throw";

export type RunBatchedSweepOptions = {
  purgeBatch: (batchSize: number) => Promise<number>;
  countEligible: () => Promise<number>;
  batchSize: number;
  dryRun: boolean;
  logger: PinoLogger;
  label: string;
  onBatchError?: (err: unknown) => SweepBatchErrorDecision;
};

export type SweepRunResult = { deleted: number; batchCount: number };

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
};

export type SweepResponse = {
  deleted: number;
  durationMs: number;
  dryRun: boolean;
  batchCount: number;
  deletedPerPass: Record<string, number>;
};

export async function runRetentionSweep(opts: RunRetentionSweepOptions): Promise<SweepResponse> {
  const batchSize = opts.body.batchSize ?? 5000;
  const dryRun = opts.body.dryRun ?? false;
  const startMs = Date.now();

  opts.logger.info(
    {
      passes: opts.passes.map((p) => ({ label: p.label, retentionDays: p.retentionDays })),
      batchSize,
      dryRun,
    },
    `${opts.label} started`,
  );

  let deleted = 0;
  let batchCount = 0;
  const deletedPerPass: Record<string, number> = {};

  // Sequential on purpose: each pass may loop hundreds of batched transactions, and
  // running passes in parallel halves the connection-pool headroom left for prod traffic.
  for (const pass of opts.passes) {
    const cutoff = new Date(Date.now() - pass.retentionDays * 24 * 60 * 60 * 1000);
    const run = await runBatchedSweep({
      purgeBatch: (size) => pass.purgeBatch(cutoff, size),
      countEligible: () => pass.countEligible(cutoff),
      batchSize,
      dryRun,
      logger: opts.logger,
      label: `${opts.label}:${pass.label}`,
      onBatchError: pass.onBatchError,
    });
    deleted += run.deleted;
    batchCount += run.batchCount;
    deletedPerPass[pass.label] = run.deleted;
  }

  const durationMs = Date.now() - startMs;
  opts.logger.info(
    { deleted, deletedPerPass, durationMs, batchCount, dryRun },
    `${opts.label} done`,
  );

  return { deleted, durationMs, dryRun, batchCount, deletedPerPass };
}

export async function runBatchedSweep(opts: RunBatchedSweepOptions): Promise<SweepRunResult> {
  if (opts.dryRun) {
    return { deleted: await opts.countEligible(), batchCount: 0 };
  }

  let totalDeleted = 0;
  let batchCount = 0;

  while (batchCount < MAX_BATCHES) {
    let deletedInBatch: number;
    try {
      deletedInBatch = await opts.purgeBatch(opts.batchSize);
    } catch (err) {
      const decision = opts.onBatchError?.(err) ?? "throw";
      if (decision === "throw") throw err;
      break;
    }

    totalDeleted += deletedInBatch;
    batchCount++;

    if (deletedInBatch === 0) break;

    if (batchCount < MAX_BATCHES) {
      // biome-ignore lint/correctness/noUndeclaredVariables: Bun global available at runtime
      await Bun.sleep(INTER_BATCH_SLEEP_MS);
    }
  }

  if (batchCount >= MAX_BATCHES) {
    opts.logger.warn(
      { batchCount: MAX_BATCHES, label: opts.label },
      `${opts.label} hit batch cap — stopping early`,
    );
  }

  return { deleted: totalDeleted, batchCount };
}
