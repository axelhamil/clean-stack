export interface HealthCheckResult {
  status: "pass" | "warn" | "fail";
  output?: string;
  observedValue?: number;
  observedUnit?: string;
}

export type HealthCheckFn = () => Promise<HealthCheckResult>;

export interface IHealthCheckRegistry {
  register(name: string, fn: HealthCheckFn, opts: { critical: boolean }): void;
}
