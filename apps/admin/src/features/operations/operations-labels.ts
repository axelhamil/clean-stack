export const SWEEP_OUTCOME_LABEL_KEYS = {
  ok: "operations.jobs.outcomes.ok",
  truncated: "operations.jobs.outcomes.truncated",
  "batch-error": "operations.jobs.outcomes.batchError",
  failed: "operations.jobs.outcomes.failed",
} as const;

export const STRIPE_STATUS_LABEL_KEYS = {
  processed: "operations.stripe.statuses.processed",
  failed: "operations.stripe.statuses.failed",
} as const;
