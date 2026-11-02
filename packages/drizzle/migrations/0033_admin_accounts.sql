CREATE TABLE "plan_override" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"tier" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"note" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "staff_note" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text,
	"organization_id" text,
	"author_id" text,
	"body" text NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "staff_note_one_subject_check" CHECK (num_nonnulls("staff_note"."user_id", "staff_note"."organization_id") = 1)
);
--> statement-breakpoint
ALTER TABLE "plan_override" ADD CONSTRAINT "plan_override_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_override" ADD CONSTRAINT "plan_override_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_note" ADD CONSTRAINT "staff_note_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_note" ADD CONSTRAINT "staff_note_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_note" ADD CONSTRAINT "staff_note_author_id_user_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "plan_override_one_open_uq" ON "plan_override" USING btree ("organization_id") WHERE "plan_override"."revoked_at" IS NULL;--> statement-breakpoint
CREATE INDEX "staff_note_user_created_idx" ON "staff_note" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "staff_note_organization_created_idx" ON "staff_note" USING btree ("organization_id","created_at");