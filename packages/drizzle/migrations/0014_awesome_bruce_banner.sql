CREATE TABLE "webhook_delivery_attempt" (
	"id" text PRIMARY KEY NOT NULL,
	"delivery_id" text NOT NULL,
	"attempt_number" integer NOT NULL,
	"request_headers" jsonb,
	"request_body" text,
	"response_status" integer,
	"response_headers" jsonb,
	"response_body" text,
	"duration_ms" integer,
	"error" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "webhook_endpoint" ADD COLUMN "previous_secret_cipher" text;--> statement-breakpoint
ALTER TABLE "webhook_endpoint" ADD COLUMN "previous_secret_expires_at" timestamp;--> statement-breakpoint
ALTER TABLE "webhook_endpoint" ADD COLUMN "consecutive_failures" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "webhook_endpoint" ADD COLUMN "first_failed_at" timestamp;--> statement-breakpoint
ALTER TABLE "webhook_endpoint" ADD COLUMN "disabled_at" timestamp;--> statement-breakpoint
ALTER TABLE "webhook_delivery_attempt" ADD CONSTRAINT "webhook_delivery_attempt_delivery_id_webhook_delivery_id_fk" FOREIGN KEY ("delivery_id") REFERENCES "public"."webhook_delivery"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "webhook_delivery_attempt_delivery_idx" ON "webhook_delivery_attempt" USING btree ("delivery_id","attempt_number");