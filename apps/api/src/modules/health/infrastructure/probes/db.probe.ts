import { db, sql } from "@packages/drizzle";
import type { HealthCheckFn } from "../../../../shared/ports/health.port";

export const probeDb: HealthCheckFn = async () => {
  const start = performance.now();
  await db.execute(sql`SELECT 1`);
  return {
    status: "pass",
    observedValue: Math.round(performance.now() - start),
    observedUnit: "ms",
  };
};
