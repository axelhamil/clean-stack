import { pgTable, text, timestamp } from "drizzle-orm/pg-core";

/**
 * One row per sweep label, holding a time-boxed lease.
 *
 * A lease, not a lock: the row carries its own expiry, so a run killed mid-sweep
 * releases automatically at `lockedUntil` instead of wedging the label forever —
 * which is what a session-scoped advisory lock would do on a pooled connection.
 *
 * `owner` fences release against an overrun: `lockedUntil` is written from the JS
 * process's clock while the acquire/release predicates compare against Postgres's
 * `now()`, and a run that outlives its TTL must not delete a successor's row just
 * because it still holds the same `label`. Both timestamps are `with time zone` —
 * the JS side writes `Date.now()` (always UTC internally) and the SQL side reads
 * the session's `now()`; without a timezone, a non-UTC session clock silently
 * decides the wrong instant for `lockedUntil < now()`.
 */
export const sweepLock = pgTable("sweep_lock", {
  label: text("label").primaryKey(),
  owner: text("owner").notNull(),
  lockedAt: timestamp("locked_at", { withTimezone: true }).defaultNow().notNull(),
  lockedUntil: timestamp("locked_until", { withTimezone: true }).notNull(),
});
