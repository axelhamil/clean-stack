export type { SQL } from "drizzle-orm";
export {
  and,
  arrayContains,
  asc,
  count,
  desc,
  eq,
  getTableColumns,
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
export type { AnyPgColumn, AnyPgTable, PgUpdateSetSource } from "drizzle-orm/pg-core";
export { alias } from "drizzle-orm/pg-core";
export { lockForTransaction, tryLockForTransaction } from "./advisory-lock";
export { closeDb, type DbClient, db, type Transaction } from "./config";
export { dbOperationFailure } from "./db-failure";
export {
  claimedSet,
  dbClockNow,
  dbNow,
  deadShareOf,
  isDeadDue,
  isDue,
  leasedBy,
  releasedSet,
  secondsFromClock,
  secondsFromNow,
} from "./lease";
export {
  closeRateLimitDb,
  getRateLimitDbClient,
  type RateLimitDbClient,
} from "./rate-limit-client";

import * as authSchema from "./schema/auth";
import * as multiTenantSchema from "./schema/multi-tenant";

export * as auditLogSchema from "./schema/audit-log";
export * as authSchema from "./schema/auth";
export * as multiTenantSchema from "./schema/multi-tenant";
export * as notificationSchema from "./schema/notification";
export const schema = { ...authSchema, ...multiTenantSchema };
export * as billingSchema from "./schema/billing";
export * as emailSchema from "./schema/email";
export type { OutboxEventMetadata } from "./schema/outbox";
export * as outboxSchema from "./schema/outbox";
export * as rateLimitSchema from "./schema/rate-limit";
export * as ssoSchema from "./schema/sso";
export * as staffSchema from "./schema/staff";
export * as sweepSchema from "./schema/sweep";
export type { WebhookDeliveryStatus } from "./schema/webhooks";
export * as webhooksSchema from "./schema/webhooks";
export {
  ambientTransaction,
  type FlushHandler,
  resolveExecutor,
  savepoint,
  TransactionService,
} from "./services/transaction-manager.service";
