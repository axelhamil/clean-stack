import { classifySweepResult } from "../../cron/sweep-result";
import type { ISweepRunStore, SweepOutcome } from "../ports/sweep-run.port";
import type { SweepResponse } from "./sweep-runner";
import type { SweepSpans } from "./sweep-span";

export interface SweepHeartbeat {
  label: string;
  store: ISweepRunStore;
  spans: SweepSpans;
}

function outcomeOf(response: SweepResponse): SweepOutcome | undefined {
  if (response.dryRun) return undefined;

  const { kind } = classifySweepResult(response);

  return kind === "skipped" ? undefined : kind;
}

export async function withSweepHeartbeat(
  { label, store, spans }: SweepHeartbeat,
  run: () => Promise<SweepResponse>,
): Promise<SweepResponse> {
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

  let response: SweepResponse;
  try {
    response = await run();
  } catch (err) {
    await beat("failed", 0);
    throw err;
  }

  const outcome = outcomeOf(response);
  if (outcome) await beat(outcome, response.deleted);

  return response;
}
