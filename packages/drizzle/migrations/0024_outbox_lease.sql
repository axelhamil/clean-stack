DROP INDEX "outbox_event_pending_idx";--> statement-breakpoint
ALTER TABLE "outbox_event" ADD COLUMN "dead_at" timestamp;--> statement-breakpoint
ALTER TABLE "outbox_event" ADD COLUMN "deliveries" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
CREATE INDEX "outbox_event_dead_retry_idx" ON "outbox_event" USING btree ("next_attempt_at") WHERE "outbox_event"."dispatched_at" is null and "outbox_event"."dead_at" is not null;--> statement-breakpoint
CREATE INDEX "outbox_event_dispatched_idx" ON "outbox_event" USING btree ("dispatched_at") WHERE "outbox_event"."dispatched_at" is not null;--> statement-breakpoint
CREATE INDEX "outbox_event_pending_idx" ON "outbox_event" USING btree ("occurred_at","id") WHERE "outbox_event"."dispatched_at" is null and "outbox_event"."dead_at" is null;--> statement-breakpoint
ALTER TABLE "outbox_event" ADD CONSTRAINT "outbox_event_deliveries_object" CHECK (jsonb_typeof("outbox_event"."deliveries") = 'object');--> statement-breakpoint
DROP TRIGGER IF EXISTS outbox_notify_trigger ON outbox_event;--> statement-breakpoint
DROP FUNCTION IF EXISTS outbox_notify();
