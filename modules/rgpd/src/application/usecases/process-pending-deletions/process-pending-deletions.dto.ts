export interface ProcessPendingDeletionsInput {
  batchSize?: number;
  dryRun?: boolean;
  deadlineMs?: number;
  now?: () => number;
}

export interface ProcessPendingDeletionsOutput {
  processed: number;
  succeeded: string[];
  failed: Array<{ userId: string; errorCode: string }>;
  dryRun: boolean;
  truncated: boolean;
}
