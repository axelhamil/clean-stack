import { sql } from "drizzle-orm";
import {
  bigint,
  check,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { session, user } from "./auth";

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

export const adminStepUp = pgTable("admin_step_up", {
  sessionId: text("session_id")
    .primaryKey()
    .references(() => session.id, { onDelete: "cascade" }),
  verifiedAt: timestamp("verified_at").notNull(),
});

export const adminTotpCounter = pgTable("admin_totp_counter", {
  userId: text("user_id")
    .primaryKey()
    .references(() => user.id, { onDelete: "cascade" }),
  lastCounter: bigint("last_counter", { mode: "number" }).notNull(),
});

export const adminApproval = pgTable(
  "admin_approval",
  {
    id: text("id").primaryKey(),
    action: text("action").notNull(),
    subjectId: text("subject_id").notNull(),
    params: jsonb("params").notNull(),
    requestedBy: text("requested_by").notNull(),
    status: text("status").notNull().default("pending"),
    decidedBy: text("decided_by"),
    decisionNote: text("decision_note"),
    failureReason: text("failure_reason"),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true, precision: 3 }).defaultNow().notNull(),
    version: integer("version").notNull().default(0),
  },
  (table) => [
    index("admin_approval_status_expires_idx").on(table.status, table.expiresAt),
    index("admin_approval_status_created_idx").on(table.status, table.createdAt, table.id),
    uniqueIndex("admin_approval_one_pending_uq")
      .on(table.action, table.subjectId)
      .where(sql`${table.status} = 'pending'`),
    check("admin_approval_four_eyes_check", sql`${table.decidedBy} <> ${table.requestedBy}`),
    check(
      "admin_approval_status_check",
      sql`${table.status} IN ('pending', 'approved', 'rejected', 'cancelled', 'expired', 'executed', 'failed')`,
    ),
    check(
      "admin_approval_action_check",
      sql`${table.action} IN ('user.ban_permanent', 'staff.role_change', 'staff.revoke')`,
    ),
  ],
);
