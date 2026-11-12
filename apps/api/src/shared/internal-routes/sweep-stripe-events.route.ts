// `/internal/sweep-stripe-events`: gated by signed HMAC + optional private-network (env-driven). Never exposed to public traffic.

import * as billingSchema from "@modules/billing/schemas/billing";
import { lt } from "@packages/drizzle";
import { requireFilter } from "@packages/drizzle/sweep-purge";
import { env } from "../env";
import { tableSweepRoute } from "./sweep-route";

const event = billingSchema.stripeEvent;
const LABEL = "sweep-stripe-events";

export const sweepStripeEventsRoutes = tableSweepRoute({
  label: LABEL,
  retentionDays: env.STRIPE_EVENT_RETENTION_DAYS,
  table: event,
  idColumn: event.id,
  orderBy: event.receivedAt,
  filterFor: (cutoff) => requireFilter(lt(event.receivedAt, cutoff), LABEL),
});
