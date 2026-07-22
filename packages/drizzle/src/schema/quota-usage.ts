import { index, integer, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { organization } from "./multi-tenant";

export const quotaUsage = pgTable(
  "quota_usage",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    resource: text("resource").notNull(),
    used: integer("used").notNull().default(0),
    periodStart: timestamp("period_start").notNull(),
    periodEnd: timestamp("period_end").notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("quota_usage_org_resource_period_uq").on(
      table.organizationId,
      table.resource,
      table.periodStart,
    ),
    index("quota_usage_org_resource_idx").on(table.organizationId, table.resource),
  ],
);
