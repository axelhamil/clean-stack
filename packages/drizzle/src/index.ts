export type { SQL } from "drizzle-orm";
export {
  and,
  arrayContains,
  asc,
  count,
  desc,
  eq,
  gt,
  gte,
  ilike,
  inArray,
  isNotNull,
  isNull,
  like,
  lt,
  lte,
  not,
  notInArray,
  or,
  sql,
} from "drizzle-orm";
export { migrate } from "drizzle-orm/node-postgres/migrator";
export type { AnyPgColumn, AnyPgTable } from "drizzle-orm/pg-core";
export { alias } from "drizzle-orm/pg-core";
export { type DbClient, db, type Transaction } from "./config";
export { getRateLimitDbClient, type RateLimitDbClient } from "./rate-limit-client";
export { trackEventsOnSuccess } from "./repositories/track-events";
export type { AuditActorType, AuditRetention } from "./schema/audit-log";

import * as authSchema from "./schema/auth";
import * as multiTenantSchema from "./schema/multi-tenant";

export type { ApiTokenRevokedReason } from "./schema/api-token";
export * as apiTokenSchema from "./schema/api-token";
export * as auditLogSchema from "./schema/audit-log";
export * as authSchema from "./schema/auth";
export * as consentSchema from "./schema/consent";
export * as multiTenantSchema from "./schema/multi-tenant";
export * as notificationSchema from "./schema/notification";
export const schema = { ...authSchema, ...multiTenantSchema };
export * as billingSchema from "./schema/billing";
export * as emailSchema from "./schema/email";
export type { OutboxEventMetadata } from "./schema/outbox";
export * as outboxSchema from "./schema/outbox";
export * as policiesSchema from "./schema/policies";
export * as quotaUsageSchema from "./schema/quota-usage";
export * as rateLimitSchema from "./schema/rate-limit";
export * as ssoSchema from "./schema/sso";
export * as sweepSchema from "./schema/sweep";
export type { WebhookDeliveryStatus } from "./schema/webhooks";
export * as webhooksSchema from "./schema/webhooks";
export { type FlushHandler, TransactionService } from "./services/transaction-manager.service";
