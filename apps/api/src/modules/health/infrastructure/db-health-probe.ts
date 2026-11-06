import type { IInstrumentation } from "@packages/ddd-kit";
import { resolveExecutor, sql } from "@packages/drizzle";
import type { OnInit } from "inwire";
import type { HealthCheckFn, IHealthCheckRegistry } from "../../../shared/ports/health.port";

const dbAttrs = { "db.system.name": "postgresql" } as const;

export class DbHealthProbe implements OnInit {
  constructor(
    private readonly registry: IHealthCheckRegistry,
    private readonly instrumentation: IInstrumentation,
  ) {}

  onInit(): void {
    this.registry.register("db:postgres", this.probe, { critical: true });
  }

  private readonly probe: HealthCheckFn = async () => {
    const exec = resolveExecutor();

    return this.instrumentation.startSpan({ name: "DbHealthProbe > probe" }, async () => {
      const start = performance.now();
      try {
        await this.instrumentation.startSpan(
          { name: "SELECT 1", op: "db.query", attributes: dbAttrs },
          () => exec.execute(sql`SELECT 1`),
        );

        return { status: "pass", observedValue: elapsedSince(start), observedUnit: "ms" };
      } catch (err) {
        this.instrumentation.capture(err);

        return {
          status: "fail",
          output: "database unreachable",
          observedValue: elapsedSince(start),
          observedUnit: "ms",
        };
      }
    });
  };
}

function elapsedSince(start: number): number {
  return Math.round(performance.now() - start);
}
