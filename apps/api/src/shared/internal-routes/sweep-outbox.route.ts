// `/internal/sweep-outbox`: gated by signed HMAC + optional private-network (env-driven). Never exposed to public traffic.

import type { SQL } from "@packages/drizzle";
import { and, isNotNull, lt, outboxSchema } from "@packages/drizzle";
import { requireFilter } from "@packages/drizzle/sweep-purge";
import { env } from "../env";
import { tableSweepRoute } from "./sweep-route";

const event = outboxSchema.outboxEvent;
const LABEL = "sweep-outbox";

export function buildPurgeFilter(cutoff: Date): SQL {
  return requireFilter(and(isNotNull(event.dispatchedAt), lt(event.dispatchedAt, cutoff)), LABEL);
}

const isForeignKeyViolation = (err: unknown): boolean =>
  err instanceof Error &&
  (err.message.includes("violates foreign key constraint") ||
    ("code" in err && (err as { code: string }).code === "23503"));

export const sweepOutboxRoutes = tableSweepRoute({
  label: LABEL,
  retentionDays: env.OUTBOX_RETENTION_DAYS,
  table: event,
  idColumn: event.id,
  orderBy: event.dispatchedAt,
  filterFor: buildPurgeFilter,
  onBatchError: (err, logger) => {
    if (!isForeignKeyViolation(err)) return "throw";

    logger.error(
      { err },
      "sweep-outbox FK violation, stopping the entire sweep (run sweep-webhook-delivery first)",
    );
    return "break";
  },
});
