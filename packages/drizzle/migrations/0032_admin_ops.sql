CREATE TABLE "stripe_event" (
	"id" text PRIMARY KEY NOT NULL,
	"type" text NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"status" text NOT NULL,
	"last_error" text,
	"replayed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "sweep_run" (
	"label" text PRIMARY KEY NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"finished_at" timestamp with time zone NOT NULL,
	"outcome" text NOT NULL,
	"duration_ms" integer NOT NULL,
	"count" integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX "stripe_event_received_at_idx" ON "stripe_event" USING btree ("received_at");