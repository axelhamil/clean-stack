ALTER TABLE "email_message" ADD COLUMN "batch_key" text;--> statement-breakpoint
CREATE INDEX "email_message_pending_created_idx" ON "email_message" USING btree ("created_at") WHERE "email_message"."status" = 'pending';--> statement-breakpoint
CREATE INDEX "email_message_batch_idx" ON "email_message" USING btree ("batch_key") WHERE "email_message"."status" in ('pending', 'dead');