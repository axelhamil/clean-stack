const SWEEP_OUTCOME_LABEL_KEYS = {
  ok: "operations.jobs.outcomes.ok",
  truncated: "operations.jobs.outcomes.truncated",
  "batch-error": "operations.jobs.outcomes.batchError",
  failed: "operations.jobs.outcomes.failed",
} as const;

const LATE_LABEL_KEY = "operations.jobs.outcomes.late";

export interface SweepState {
  outcome: keyof typeof SWEEP_OUTCOME_LABEL_KEYS;
  late: boolean;
}

export function sweepStateView({ outcome, late }: SweepState) {
  const hasFailed = outcome === "failed" || outcome === "batch-error";
  const labelKey = late && !hasFailed ? LATE_LABEL_KEY : SWEEP_OUTCOME_LABEL_KEYS[outcome];

  return { labelKey, variant: hasFailed || late ? "destructive" : "secondary" } as const;
}
