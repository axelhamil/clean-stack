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
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "admin_approval_four_eyes_check" CHECK ("admin_approval"."decided_by" <> "admin_approval"."requested_by"),
	CONSTRAINT "admin_approval_status_check" CHECK ("admin_approval"."status" IN ('pending', 'approved', 'rejected', 'cancelled', 'expired', 'executed', 'failed')),
	CONSTRAINT "admin_approval_action_check" CHECK ("admin_approval"."action" IN ('user.ban_permanent', 'staff.role_change', 'staff.revoke'))
);
--> statement-breakpoint
ALTER TABLE "admin_approval" ADD CONSTRAINT "admin_approval_subject_id_user_id_fk" FOREIGN KEY ("subject_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_approval" ADD CONSTRAINT "admin_approval_requested_by_user_id_fk" FOREIGN KEY ("requested_by") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_approval" ADD CONSTRAINT "admin_approval_decided_by_user_id_fk" FOREIGN KEY ("decided_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "admin_approval_status_expires_idx" ON "admin_approval" USING btree ("status","expires_at");--> statement-breakpoint
CREATE INDEX "admin_approval_status_created_idx" ON "admin_approval" USING btree ("status","created_at");