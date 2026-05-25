import { Hono } from "hono";
import { di } from "../../container";
import { env } from "../../shared/env";
import type { AggregatedReport, HealthStatus } from "../../shared/ports/health.port";
import { lifecycleState } from "../../shared/shutdown";

const startedAt = Date.now();

const httpStatusFor = (status: HealthStatus): 200 | 503 => (status === "fail" ? 503 : 200);

const baseInfo = () => ({
  version: env.GIT_SHA?.slice(0, 12) ?? "unknown",
  commitSha: env.GIT_SHA ?? "unknown",
  buildTime: env.BUILD_TIME ?? "unknown",
  runtime: `bun/${process.versions.bun ?? "unknown"}`,
  uptimeMs: Date.now() - startedAt,
});

const stripSensitive = (report: AggregatedReport): AggregatedReport => {
  if (env.NODE_ENV !== "production") return report;
  return {
    status: report.status,
    checks: report.checks.map((c) => ({
      name: c.name,
      result: { status: c.result.status },
      durationMs: 0,
      critical: c.critical,
      time: c.time,
    })),
  };
};

export const healthRoutes = new Hono()
  .get("/livez", (c) => c.json({ status: "pass" as HealthStatus, ...baseInfo() }, 200))
  .get("/readyz", async (c) => {
    if (lifecycleState.isShuttingDown()) {
      return c.json({ status: "fail" as HealthStatus, output: "shutting down" }, 503);
    }
    const report = await di.IHealthCheckRegistry.runAll();
    return c.json(stripSensitive(report), httpStatusFor(report.status));
  })
  .get("/startupz", (c) => {
    if (!lifecycleState.isStarted()) {
      return c.json({ status: "fail" as HealthStatus, output: "starting" }, 503);
    }
    return c.json({ status: "pass" as HealthStatus, ...baseInfo() }, 200);
  });
