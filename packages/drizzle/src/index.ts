export {
  and,
  arrayContains,
  count,
  desc,
  eq,
  gt,
  gte,
  inArray,
  isNotNull,
  isNull,
  like,
  lt,
  lte,
  not,
  or,
  sql,
} from "drizzle-orm";
export { migrate } from "drizzle-orm/node-postgres/migrator";
export type { AnyPgTable } from "drizzle-orm/pg-core";
export { type DbClient, db, type Transaction } from "./config";
export { trackEventsOnSuccess } from "./repositories/track-events";
export type { AuditActorType, AuditRetention } from "./schema/audit-log";

import * as authSchema from "./schema/auth";
import * as multiTenantSchema from "./schema/multi-tenant";

export * as auditLogSchema from "./schema/audit-log";
export * as authSchema from "./schema/auth";
export * as multiTenantSchema from "./schema/multi-tenant";
export const schema = { ...authSchema, ...multiTenantSchema };
export type { OutboxEventMetadata } from "./schema/outbox";
export * as outboxSchema from "./schema/outbox";
export type { WebhookDeliveryStatus } from "./schema/webhooks";
export * as webhooksSchema from "./schema/webhooks";
export { type FlushHandler, TransactionService } from "./services/transaction-manager.service";
