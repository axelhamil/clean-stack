export interface RgpdSettings {
  appUrl: string;
  gracePeriodDays: number;
  exportRateLimitHours: number;
  sweepDeadlineMs: number;
  sweepBatchSize: number;
}
