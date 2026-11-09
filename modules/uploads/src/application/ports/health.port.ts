import type { HealthCheckFn } from "@packages/ddd-kit";

export interface IHealthCheckRegistry {
  register(name: string, fn: HealthCheckFn, opts: { critical: boolean }): void;
}
