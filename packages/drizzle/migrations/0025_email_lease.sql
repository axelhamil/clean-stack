DROP INDEX "email_message_failed_sweep_idx";--> statement-breakpoint
CREATE INDEX "email_message_dead_retry_idx" ON "email_message" USING btree ("next_attempt_at") WHERE "email_message"."status" = 'dead';--> statement-breakpoint
CREATE INDEX "email_message_failed_sweep_idx" ON "email_message" USING btree ("created_at") WHERE "email_message"."status" in ('failed', 'dead');