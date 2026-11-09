export type HealthStatus = "pass" | "warn" | "fail";

export interface HealthCheckResult {
  status: HealthStatus;
  output?: string;
  observedValue?: number;
  observedUnit?: string;
}

export type HealthCheckFn = () => Promise<HealthCheckResult>;
