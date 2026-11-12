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

// 23503 foreign_key_violation, 23001 restrict_violation: an `ON DELETE RESTRICT`
// reference raises the latter. The driver error sits under the query builder's `cause`.
const FOREIGN_KEY_SQLSTATES = new Set(["23503", "23001"]);

const isForeignKeyViolation = (err: unknown, seen = new Set<Error>()): boolean => {
  if (!(err instanceof Error) || seen.has(err)) return false;
  if ("code" in err && typeof err.code === "string" && FOREIGN_KEY_SQLSTATES.has(err.code)) {
    return true;
  }

  seen.add(err);
  return isForeignKeyViolation(err.cause, seen);
};

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
