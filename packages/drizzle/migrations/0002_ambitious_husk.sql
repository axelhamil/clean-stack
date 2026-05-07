CREATE TABLE "audit_log" (
	"id" text PRIMARY KEY NOT NULL,
	"actor_id" text,
	"actor_type" text NOT NULL,
	"organization_id" text,
	"action" text NOT NULL,
	"target_type" text NOT NULL,
	"target_id" text NOT NULL,
	"metadata" jsonb NOT NULL,
	"request_id" text,
	"retention" text NOT NULL,
	"prev_hash" text,
	"hash" text,
	"occurred_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "outbox_event" (
	"id" text PRIMARY KEY NOT NULL,
	"event_type" text NOT NULL,
	"aggregate_id" text NOT NULL,
	"aggregate_type" text NOT NULL,
	"organization_id" text,
	"payload" jsonb NOT NULL,
	"metadata" jsonb NOT NULL,
	"occurred_at" timestamp NOT NULL,
	"dispatched_at" timestamp,
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	"next_attempt_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "webhook_delivery" (
	"id" text PRIMARY KEY NOT NULL,
	"endpoint_id" text NOT NULL,
	"outbox_event_id" text NOT NULL,
	"event_type" text NOT NULL,
	"payload" jsonb NOT NULL,
	"status" text NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"next_attempt_at" timestamp,
	"last_error" text,
	"last_response_status" integer,
	"idempotency_key" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "webhook_endpoint" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"url" text NOT NULL,
	"secret_cipher" text NOT NULL,
	"event_types" text[] DEFAULT '{}'::text[] NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "webhook_delivery" ADD CONSTRAINT "webhook_delivery_endpoint_id_webhook_endpoint_id_fk" FOREIGN KEY ("endpoint_id") REFERENCES "public"."webhook_endpoint"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webhook_delivery" ADD CONSTRAINT "webhook_delivery_outbox_event_id_outbox_event_id_fk" FOREIGN KEY ("outbox_event_id") REFERENCES "public"."outbox_event"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webhook_endpoint" ADD CONSTRAINT "webhook_endpoint_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_log_actor_time_idx" ON "audit_log" USING btree ("actor_id","occurred_at" DESC);--> statement-breakpoint
CREATE INDEX "audit_log_target_idx" ON "audit_log" USING btree ("target_type","target_id");--> statement-breakpoint
CREATE INDEX "audit_log_action_time_idx" ON "audit_log" USING btree ("action","occurred_at" DESC);--> statement-breakpoint
CREATE INDEX "audit_log_org_time_idx" ON "audit_log" USING btree ("organization_id","occurred_at" DESC);--> statement-breakpoint
CREATE INDEX "audit_log_retention_time_idx" ON "audit_log" USING btree ("retention","occurred_at");--> statement-breakpoint
CREATE INDEX "outbox_event_pending_idx" ON "outbox_event" USING btree ("next_attempt_at","occurred_at") WHERE dispatched_at IS NULL;--> statement-breakpoint
CREATE INDEX "outbox_event_type_idx" ON "outbox_event" USING btree ("event_type");--> statement-breakpoint
CREATE INDEX "outbox_event_aggregate_idx" ON "outbox_event" USING btree ("aggregate_type","aggregate_id");--> statement-breakpoint
CREATE UNIQUE INDEX "webhook_delivery_idempotency_uidx" ON "webhook_delivery" USING btree ("idempotency_key");--> statement-breakpoint
CREATE INDEX "webhook_delivery_pending_idx" ON "webhook_delivery" USING btree ("next_attempt_at") WHERE status IN ('pending', 'failed');--> statement-breakpoint
CREATE INDEX "webhook_delivery_endpoint_idx" ON "webhook_delivery" USING btree ("endpoint_id");--> statement-breakpoint
CREATE INDEX "webhook_delivery_event_idx" ON "webhook_delivery" USING btree ("outbox_event_id");--> statement-breakpoint
CREATE INDEX "webhook_endpoint_org_idx" ON "webhook_endpoint" USING btree ("organization_id");