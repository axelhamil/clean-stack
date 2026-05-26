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

export type SweepResponse = {
  deleted: number;
  durationMs: number;
  dryRun: boolean;
  batchCount: number;
};

export type RunRetentionSweepOptions = {
  body: SweepBody;
  retentionDays: number;
  purgeBatch: (cutoff: Date, batchSize: number) => Promise<number>;
  countEligible: (cutoff: Date) => Promise<number>;
  logger: PinoLogger;
  label: string;
  onBatchError?: (err: unknown) => SweepBatchErrorDecision;
};

export async function runRetentionSweep(opts: RunRetentionSweepOptions): Promise<SweepResponse> {
  const batchSize = opts.body.batchSize ?? 5000;
  const dryRun = opts.body.dryRun ?? false;

  opts.logger.info(
    { retentionDays: opts.retentionDays, batchSize, dryRun },
    `${opts.label} started`,
  );

  const startMs = Date.now();
  const cutoff = new Date(Date.now() - opts.retentionDays * 24 * 60 * 60 * 1000);

  const { deleted, batchCount } = await runBatchedSweep({
    purgeBatch: (size) => opts.purgeBatch(cutoff, size),
    countEligible: () => opts.countEligible(cutoff),
    batchSize,
    dryRun,
    logger: opts.logger,
    label: opts.label,
    onBatchError: opts.onBatchError,
  });

  const durationMs = Date.now() - startMs;
  opts.logger.info({ deleted, durationMs, batchCount, dryRun }, `${opts.label} done`);

  return { deleted, durationMs, dryRun, batchCount };
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
