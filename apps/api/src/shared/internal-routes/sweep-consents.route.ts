// `/internal/sweep-consents`: gated by signed HMAC + optional private-network (env-driven). Never exposed to public traffic.
// Purges ONLY guest (userId IS NULL) expired consent records. Authed records are compliance evidence, never purged.

import * as consentSchema from "@modules/consents/schemas/consent";
import { and, isNull, lt } from "@packages/drizzle";
import { requireFilter } from "@packages/drizzle/sweep-purge";
import { env } from "../env";
import { tableSweepRoute } from "./sweep-route";

const record = consentSchema.consentRecord;
const LABEL = "sweep-consents";

export const sweepConsentsRoutes = tableSweepRoute({
  label: LABEL,
  retentionDays: env.CONSENT_RETENTION_DAYS,
  table: record,
  idColumn: record.id,
  orderBy: record.expiresAt,
  filterFor: (cutoff) =>
    requireFilter(and(isNull(record.userId), lt(record.expiresAt, cutoff)), LABEL),
});
