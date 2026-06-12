import { sql } from "drizzle-orm";
import { index, integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";

export const rateLimitRecord = pgTable(
  "rate_limit",
  {
    key: text("key").primaryKey(),
    points: integer("points").notNull(),
    expire: timestamp("expire"),
  },
  (table) => [
    // Partial index: the lib's 5-min purge DELETE scans on expire; only non-null rows expire.
    index("rate_limit_expire_idx").on(table.expire).where(sql`${table.expire} IS NOT NULL`),
  ],
);
