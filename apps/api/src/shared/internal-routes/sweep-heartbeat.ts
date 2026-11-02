import type { ISweepRunStore, SweepOutcome } from "../ports/sweep-run.port";
import { classifySweepResult } from "./sweep-result";
import type { SweepResponse } from "./sweep-runner";
import type { SweepSpans } from "./sweep-span";

export type SweepBeat = { outcome: SweepOutcome; count: number };

export interface SweepHeartbeat<T> {
  label: string;
  store: ISweepRunStore;
  spans: SweepSpans;
  beatOf: (response: T) => SweepBeat | undefined;
  dryRun?: boolean;
}

export function beatOfSweep(response: SweepResponse): SweepBeat | undefined {
  if (response.dryRun) return undefined;

  const { kind } = classifySweepResult(response);
  if (kind === "skipped") return undefined;

  return { outcome: kind, count: response.deleted };
}

export async function withSweepHeartbeat<T>(
  { label, store, spans, beatOf, dryRun }: SweepHeartbeat<T>,
  run: () => Promise<T>,
): Promise<T> {
  const startedAt = new Date();

  const beat = async (outcome: SweepOutcome, count: number): Promise<void> => {
    const finishedAt = new Date();

    try {
      await store.record({
        label,
        startedAt,
        finishedAt,
        outcome,
        durationMs: finishedAt.getTime() - startedAt.getTime(),
        count,
      });
    } catch (err) {
      spans.capture(err, { label, phase: "heartbeat" });
    }
  };

  let response: T;
  try {
    response = await run();
  } catch (err) {
    if (!dryRun) await beat("failed", 0);
    throw err;
  }

  const summary = beatOf(response);
  if (summary) await beat(summary.outcome, summary.count);

  return response;
}
