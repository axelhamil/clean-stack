import { boolean, index, integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";

export const STRIPE_EVENT_STATUSES = ["processed", "failed"] as const;

export const subscription = pgTable(
  "subscription",
  {
    id: text("id").primaryKey(),
    plan: text("plan").notNull(),
    referenceId: text("reference_id").notNull(),
    stripeCustomerId: text("stripe_customer_id"),
    stripeSubscriptionId: text("stripe_subscription_id"),
    status: text("status").notNull().default("incomplete"),
    periodStart: timestamp("period_start"),
    periodEnd: timestamp("period_end"),
    trialStart: timestamp("trial_start"),
    trialEnd: timestamp("trial_end"),
    cancelAtPeriodEnd: boolean("cancel_at_period_end").default(false),
    cancelAt: timestamp("cancel_at"),
    canceledAt: timestamp("canceled_at"),
    endedAt: timestamp("ended_at"),
    seats: integer("seats"),
    billingInterval: text("billing_interval"),
    stripeScheduleId: text("stripe_schedule_id"),
  },
  (table) => [
    index("subscription_reference_id_idx").on(table.referenceId),
    index("subscription_stripe_customer_id_idx").on(table.stripeCustomerId),
  ],
);

export const stripeEvent = pgTable(
  "stripe_event",
  {
    id: text("id").primaryKey(),
    type: text("type").notNull(),
    receivedAt: timestamp("received_at", { withTimezone: true }).notNull().defaultNow(),
    status: text("status", { enum: STRIPE_EVENT_STATUSES }).notNull(),
    lastError: text("last_error"),
    replayedAt: timestamp("replayed_at", { withTimezone: true }),
  },
  (table) => [index("stripe_event_received_at_idx").on(table.receivedAt)],
);
