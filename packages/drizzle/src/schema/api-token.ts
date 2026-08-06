import { index, jsonb, pgTable, smallint, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { user } from "./auth";
import { organization } from "./multi-tenant";

export const API_TOKEN_REVOKED_REASONS = ["user", "membership_lost", "leaked"] as const;

export type ApiTokenRevokedReason = (typeof API_TOKEN_REVOKED_REASONS)[number];

export const apiToken = pgTable(
  "api_token",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    organizationId: text("organization_id").references(() => organization.id, {
      onDelete: "cascade",
    }),
    name: text("name").notNull(),
    scopes: jsonb("scopes").$type<string[]>().notNull(),
    tokenHmac: text("token_hmac").notNull(),
    pepperVersion: smallint("pepper_version").notNull().default(1),
    tokenStart: text("token_start").notNull(),
    lastUsedAt: timestamp("last_used_at"),
    expiresAt: timestamp("expires_at"),
    revokedAt: timestamp("revoked_at"),
    revokedReason: text("revoked_reason").$type<ApiTokenRevokedReason>(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    uniqueIndex("api_token_hmac_uidx").on(table.tokenHmac),
    index("api_token_user_idx").on(table.userId),
    index("api_token_org_idx").on(table.organizationId),
  ],
);
