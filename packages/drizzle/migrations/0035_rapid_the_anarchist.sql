ALTER TABLE "stripe_event" ADD COLUMN "replay_claimed_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "subscription_stripe_subscription_id_idx" ON "subscription" USING btree ("stripe_subscription_id");--> statement-breakpoint
UPDATE "stripe_event" SET "status" = 'received' WHERE "status" = 'processed';
