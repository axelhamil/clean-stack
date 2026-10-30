CREATE TABLE "admin_approval" (
	"id" text PRIMARY KEY NOT NULL,
	"action" text NOT NULL,
	"subject_id" text NOT NULL,
	"params" jsonb NOT NULL,
	"requested_by" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"decided_by" text,
	"decision_note" text,
	"failure_reason" text,
	"expires_at" timestamp with time zone NOT NULL,
	"decided_at" timestamp with time zone,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "admin_approval_four_eyes_check" CHECK ("admin_approval"."decided_by" <> "admin_approval"."requested_by"),
	CONSTRAINT "admin_approval_status_check" CHECK ("admin_approval"."status" IN ('pending', 'approved', 'rejected', 'cancelled', 'expired', 'executed', 'failed')),
	CONSTRAINT "admin_approval_action_check" CHECK ("admin_approval"."action" IN ('user.ban_permanent', 'staff.role_change', 'staff.revoke'))
);
--> statement-breakpoint
CREATE INDEX "admin_approval_status_expires_idx" ON "admin_approval" USING btree ("status","expires_at");--> statement-breakpoint
CREATE INDEX "admin_approval_status_created_idx" ON "admin_approval" USING btree ("status","created_at","id");--> statement-breakpoint
CREATE UNIQUE INDEX "admin_approval_one_pending_uq" ON "admin_approval" USING btree ("action","subject_id") WHERE "admin_approval"."status" = 'pending';