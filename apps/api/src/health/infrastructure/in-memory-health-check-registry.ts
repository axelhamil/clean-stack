import type {
  HealthCheckFn,
  HealthCheckResult,
  HealthStatus,
  IInstrumentation,
} from "@packages/ddd-kit";
import { raceWithTimeout } from "@packages/outbox/race-with-timeout";
import type {
  AggregatedHealthCheck,
  AggregatedReport,
  HealthCheckRegistration,
  IHealthCheckRegistry,
} from "../health.port";

const CHECK_TIMEOUT_MS = 5_000;
const CACHE_TTL_PASS_MS = 30_000;
const CACHE_TTL_FAIL_MS = 5_000;

type CacheEntry = { check: AggregatedHealthCheck; expiresAt: number };

export class InMemoryHealthCheckRegistry implements IHealthCheckRegistry {
  private readonly registrations = new Map<string, HealthCheckRegistration>();
  private readonly cache = new Map<string, CacheEntry>();

  constructor(private readonly instrumentation: IInstrumentation) {}

  register(name: string, fn: HealthCheckFn, opts: { critical: boolean }): void {
    if (this.registrations.has(name)) {
      throw new Error(`Health check '${name}' already registered`);
    }
    this.registrations.set(name, { name, fn, critical: opts.critical });
  }

  list(): readonly HealthCheckRegistration[] {
    return [...this.registrations.values()];
  }

  async runAll(): Promise<AggregatedReport> {
    const now = Date.now();
    const checks = await Promise.all(
      [...this.registrations.values()].map((r) => this.runOne(r, now)),
    );
    return { status: aggregate(checks), checks };
  }

  private async runOne(reg: HealthCheckRegistration, now: number): Promise<AggregatedHealthCheck> {
    const cached = this.cache.get(reg.name);
    if (cached && cached.expiresAt > now) return cached.check;

    const start = performance.now();
    const result = await this.runWithTimeout(reg.fn);
    const durationMs = Math.round(performance.now() - start);
    const aggregated: AggregatedHealthCheck = {
      name: reg.name,
      result,
      durationMs,
      critical: reg.critical,
      time: new Date().toISOString(),
    };

    const ttl = result.status === "pass" ? CACHE_TTL_PASS_MS : CACHE_TTL_FAIL_MS;
    this.cache.set(reg.name, { check: aggregated, expiresAt: now + ttl });
    return aggregated;
  }

  private runWithTimeout(fn: HealthCheckFn): Promise<HealthCheckResult> {
    const settled = fn().catch((err): HealthCheckResult => {
      this.instrumentation.capture(err);

      return {
        status: "fail",
        output: err instanceof Error ? err.message : "unknown error",
      };
    });

    return raceWithTimeout(settled, CHECK_TIMEOUT_MS, () => ({
      status: "fail",
      output: `timeout >${CHECK_TIMEOUT_MS}ms`,
    }));
  }
}

function aggregate(checks: AggregatedHealthCheck[]): HealthStatus {
  let worst: HealthStatus = "pass";
  for (const c of checks) {
    if (c.result.status === "fail" && c.critical) return "fail";
    if (c.result.status === "fail") worst = worst === "pass" ? "warn" : worst;
    else if (c.result.status === "warn" && worst === "pass") worst = "warn";
  }
  return worst;
}
