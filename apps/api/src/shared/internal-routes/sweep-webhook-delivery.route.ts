// `/internal/sweep-webhook-delivery`: gated by signed HMAC + optional private-network (env-driven). Never exposed to public traffic.

import * as webhooksSchema from "@modules/webhooks/schemas/webhooks";
import { and, inArray, lt } from "@packages/drizzle";
import { requireFilter } from "@packages/drizzle/sweep-purge";
import { env } from "../env";
import { tableSweepRoute } from "./sweep-route";

const RETENTION_STATUSES = ["success", "dead_letter"] as const;
const LABEL = "sweep-webhook-delivery";

const wd = webhooksSchema.webhookDelivery;

export const sweepWebhookDeliveryRoutes = tableSweepRoute({
  label: LABEL,
  retentionDays: env.WEBHOOK_DELIVERY_RETENTION_DAYS,
  table: wd,
  idColumn: wd.id,
  orderBy: wd.createdAt,
  filterFor: (cutoff) =>
    requireFilter(
      and(inArray(wd.status, [...RETENTION_STATUSES]), lt(wd.createdAt, cutoff)),
      LABEL,
    ),
});
