import type { AnyPgColumn, AnyPgTable, SQL } from "@packages/drizzle";
import { countEligibleWithTimeout } from "@packages/drizzle/sweep-count";
import { purgeBatchWithTimeout } from "@packages/drizzle/sweep-purge";
import { type SweepSpans, sweepSpans } from "@packages/drizzle/sweep-span";
import { beatOfSweep, withSweepHeartbeat } from "@packages/http/sweep-heartbeat";
import {
  type RetentionPass,
  runRetentionSweep,
  type SweepBatchErrorDecision,
  type SweepBody,
  type SweepResponse,
  sweepBodySchema,
} from "@packages/http/sweep-runner";
import { zV } from "@packages/http/validator";
import { Hono } from "hono";
import type { PinoLogger } from "hono-pino";
import { di } from "../../container";
import { env } from "../env";
import { internalLayers } from "./internal-layers";
import { sweepLockFor } from "./sweep-lock";

type TablePassOptions = {
  label: string;
  retentionDays: number;
  table: AnyPgTable;
  idColumn: AnyPgColumn;
  /** Oldest-first column, so a truncated run resumes where it stopped. */
  orderBy: AnyPgColumn;
  /** Built through `requireFilter`, so a predicate that collapsed to nothing throws. */
  filterFor: (cutoff: Date) => SQL;
  onBatchError?: (err: unknown) => SweepBatchErrorDecision;
};

/**
 * One retention pass over one table: the batched delete and the dry-run count share
 * the same predicate, so the two can never disagree on what "eligible" means.
 */
export function tableRetentionPass(opts: TablePassOptions, spans: SweepSpans): RetentionPass {
  const { table, idColumn, orderBy, filterFor } = opts;

  return {
    label: opts.label,
    retentionDays: opts.retentionDays,
    purgeBatch: (cutoff, batchSize) =>
      purgeBatchWithTimeout({
        table,
        idColumn,
        where: filterFor(cutoff),
        orderBy,
        batchSize,
        spans,
        uow: di.ITransactionService,
      }),
    countEligible: (cutoff) =>
      countEligibleWithTimeout(table, filterFor(cutoff), spans, di.ITransactionService),
    onBatchError: opts.onBatchError,
  };
}

/**
 * The request-scoped wiring every sweep route shares: one span facade per request
 * (the db-span budget is per run, and two labels can sweep concurrently without
 * sharing it), the process-wide deadline, and a lease under the route's own label.
 */
export function runSweepRequest(opts: {
  label: string;
  body: SweepBody;
  logger: PinoLogger;
  passes: (spans: SweepSpans) => RetentionPass[];
}): Promise<SweepResponse> {
  const spans = sweepSpans(di.IInstrumentation);

  return withSweepHeartbeat(
    {
      label: opts.label,
      store: di.ISweepRunStore,
      spans,
      beatOf: beatOfSweep,
      dryRun: opts.body.dryRun,
    },
    () =>
      runRetentionSweep({
        body: opts.body,
        spans,
        passes: opts.passes(spans),
        logger: opts.logger,
        label: opts.label,
        deadlineMs: env.SWEEP_DEADLINE_MS,
        lock: sweepLockFor(opts.label, spans),
      }),
  );
}

export type TableSweepRouteOptions = Omit<TablePassOptions, "label" | "onBatchError"> & {
  label: string;
  onBatchError?: (err: unknown, logger: PinoLogger) => SweepBatchErrorDecision;
};

export function tableSweepRoute(opts: TableSweepRouteOptions) {
  const { label, onBatchError, ...pass } = opts;

  return new Hono<{ Variables: { logger: PinoLogger } }>()
    .use("*", ...internalLayers)
    .post(`/${label}`, zV("json", sweepBodySchema), async (c) => {
      const logger = c.var.logger;

      const response = await runSweepRequest({
        label,
        body: c.req.valid("json"),
        logger,
        passes: (spans) => [
          tableRetentionPass(
            {
              ...pass,
              label: "default",
              onBatchError: onBatchError && ((err) => onBatchError(err, logger)),
            },
            spans,
          ),
        ],
      });

      return c.json(response);
    });
}
