import type { HealthStatus } from "@packages/ddd-kit";
import { Hono } from "hono";
import { di } from "../container";
import { env } from "../shared/env";
import { lifecycleState } from "../shared/shutdown";
import type { AggregatedReport } from "./health.port";

const PASS: HealthStatus = "pass";
const FAIL: HealthStatus = "fail";

const startedAt = Date.now();
const uptimeMs = () => Date.now() - startedAt;

const httpStatusFor = (status: HealthStatus): 200 | 503 => (status === "fail" ? 503 : 200);

export const buildInfo = () => ({
  version: env.GIT_SHA?.slice(0, 12) ?? "unknown",
  commitSha: env.GIT_SHA ?? "unknown",
  buildTime: env.BUILD_TIME ?? "unknown",
  runtime: `bun/${process.versions.bun ?? "unknown"}`,
  uptimeMs: uptimeMs(),
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
  .get("/livez", (c) => c.json({ status: PASS, uptimeMs: uptimeMs() }, 200))
  .get("/readyz", async (c) => {
    if (lifecycleState.isShuttingDown()) {
      return c.json({ status: FAIL, output: "shutting down" }, 503);
    }
    const report = await di.IHealthCheckRegistry.runAll();
    return c.json(stripSensitive(report), httpStatusFor(report.status));
  })
  .get("/startupz", (c) => {
    if (!lifecycleState.isStarted()) {
      return c.json({ status: FAIL, output: "starting" }, 503);
    }
    return c.json({ status: PASS, uptimeMs: uptimeMs() }, 200);
  });
