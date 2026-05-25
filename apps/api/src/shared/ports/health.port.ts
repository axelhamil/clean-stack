export type HealthStatus = "pass" | "warn" | "fail";

export interface HealthCheckResult {
  status: HealthStatus;
  output?: string;
  observedValue?: number;
  observedUnit?: string;
}

export type HealthCheckFn = () => Promise<HealthCheckResult>;

export interface HealthCheckRegistration {
  name: string;
  fn: HealthCheckFn;
  critical: boolean;
}

export interface AggregatedHealthCheck {
  name: string;
  result: HealthCheckResult;
  durationMs: number;
  critical: boolean;
  time: string;
}

export interface AggregatedReport {
  status: HealthStatus;
  checks: AggregatedHealthCheck[];
}

export interface IHealthCheckRegistry {
  register(name: string, fn: HealthCheckFn, opts: { critical: boolean }): void;
  list(): readonly HealthCheckRegistration[];
  runAll(): Promise<AggregatedReport>;
}
