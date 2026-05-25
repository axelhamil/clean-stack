DROP INDEX "outbox_event_pending_idx";--> statement-breakpoint
DROP INDEX "webhook_delivery_pending_idx";--> statement-breakpoint
CREATE INDEX "outbox_event_pending_idx" ON "outbox_event" USING btree ("next_attempt_at","occurred_at") WHERE "outbox_event"."dispatched_at" is null;--> statement-breakpoint
CREATE INDEX "webhook_delivery_pending_idx" ON "webhook_delivery" USING btree ("next_attempt_at") WHERE "webhook_delivery"."status" IN ('pending', 'failed');