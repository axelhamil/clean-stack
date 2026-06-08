import { POLICY_TYPES } from "@packages/policies";
import { sql } from "drizzle-orm";
import { index, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { user } from "./auth";

export const policyAcceptance = pgTable(
  "policy_acceptance",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    policyType: text("policy_type", { enum: POLICY_TYPES }).notNull(),
    policyVersion: text("policy_version").notNull(),
    ipAddress: text("ip_address"),
    acceptedAt: timestamp("accepted_at").defaultNow().notNull(),
  },
  (table) => [
    index("policy_acceptance_user_type_time_idx").on(
      table.userId,
      table.policyType,
      sql`${table.acceptedAt} DESC`,
    ),
  ],
);
