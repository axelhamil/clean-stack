import type { ConsentCategory } from "@packages/cookie-consent";
import { index, jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { user } from "./auth";

export const consentRecord = pgTable(
  "consent_record",
  {
    id: text("id").primaryKey(),
    subjectId: text("subject_id").notNull(),
    userId: text("user_id").references(() => user.id, { onDelete: "cascade" }),
    categories: jsonb("categories").notNull().$type<ConsentCategory[]>(),
    policyVersion: text("policy_version").notNull(),
    grantedAt: timestamp("granted_at").defaultNow().notNull(),
    withdrawnAt: timestamp("withdrawn_at"),
    expiresAt: timestamp("expires_at").notNull(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
  },
  (table) => [
    index("consent_record_subject_expires_idx").on(table.subjectId, table.expiresAt.desc()),
    index("consent_record_user_expires_idx").on(table.userId, table.expiresAt.desc()),
  ],
);
