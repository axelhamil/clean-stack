import { pgTable, text, timestamp } from "drizzle-orm/pg-core";

/**
 * One row per sweep label, holding a time-boxed lease.
 *
 * A lease, not a lock: the row carries its own expiry, so a run killed mid-sweep
 * releases automatically at `lockedUntil` instead of wedging the label forever —
 * which is what a session-scoped advisory lock would do on a pooled connection.
 */
export const sweepLock = pgTable("sweep_lock", {
  label: text("label").primaryKey(),
  lockedAt: timestamp("locked_at").defaultNow().notNull(),
  lockedUntil: timestamp("locked_until").notNull(),
});
