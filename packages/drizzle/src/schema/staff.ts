import { sql } from "drizzle-orm";
import { check, index, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { user } from "./auth";

export const staffMember = pgTable(
  "staff_member",
  {
    userId: text("user_id")
      .primaryKey()
      .references(() => user.id, { onDelete: "cascade" }),
    role: text("role").notNull(),
    source: text("source").notNull(),
    createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
    revokedAt: timestamp("revoked_at"),
  },
  (table) => [
    index("staff_member_role_revoked_idx").on(table.role, table.revokedAt),
    check("staff_member_source_check", sql`${table.source} IN ('env', 'console', 'migration')`),
  ],
);

export const staffPermissionOverride = pgTable(
  "staff_permission_override",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => staffMember.userId, { onDelete: "cascade" }),
    permission: text("permission").notNull(),
    effect: text("effect").notNull(),
    createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    expiresAt: timestamp("expires_at"),
    revokedAt: timestamp("revoked_at"),
  },
  (table) => [
    index("staff_permission_override_user_idx").on(table.userId),
    check("staff_permission_override_effect_check", sql`${table.effect} IN ('grant', 'deny')`),
  ],
);
