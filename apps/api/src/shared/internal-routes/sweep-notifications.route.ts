// `/internal/sweep-notifications`: gated by signed HMAC + optional private-network (env-driven). Never exposed to public traffic.

import * as notificationSchema from "@modules/notifications/schemas/notification";
import type { SQL } from "@packages/drizzle";
import { and, isNotNull, lt } from "@packages/drizzle";
import { requireFilter } from "@packages/drizzle/sweep-purge";
import { env } from "../env";
import { tableSweepRoute } from "./sweep-route";

const n = notificationSchema.notification;

export function buildPurgeFilter(cutoff: Date): SQL {
  return requireFilter(and(isNotNull(n.readAt), lt(n.createdAt, cutoff)), "sweep-notifications");
}

export const sweepNotificationsRoutes = tableSweepRoute({
  label: "sweep-notifications",
  retentionDays: env.NOTIFICATION_RETENTION_DAYS,
  table: n,
  idColumn: n.id,
  orderBy: n.createdAt,
  filterFor: buildPurgeFilter,
});
