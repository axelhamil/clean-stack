CREATE TABLE "email_message" (
	"id" text PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"template" text,
	"to_address" text NOT NULL,
	"subject" text NOT NULL,
	"payload" jsonb NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"next_attempt_at" timestamp,
	"sent_at" timestamp,
	"last_error" text,
	"provider_message_id" text,
	"idempotency_key" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "email_message_idempotency_uidx" ON "email_message" USING btree ("idempotency_key");--> statement-breakpoint
CREATE INDEX "email_message_pending_idx" ON "email_message" USING btree ("next_attempt_at","created_at") WHERE "email_message"."status" = 'pending';--> statement-breakpoint
CREATE INDEX "email_message_sweep_idx" ON "email_message" USING btree ("sent_at") WHERE "email_message"."status" = 'sent';