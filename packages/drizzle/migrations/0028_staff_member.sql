CREATE TABLE "staff_member" (
	"user_id" text PRIMARY KEY NOT NULL,
	"role" text NOT NULL,
	"source" text NOT NULL,
	"created_by" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"revoked_at" timestamp,
	CONSTRAINT "staff_member_source_check" CHECK ("staff_member"."source" IN ('env', 'console', 'migration'))
);
--> statement-breakpoint
CREATE TABLE "staff_permission_override" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"permission" text NOT NULL,
	"effect" text NOT NULL,
	"created_by" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"expires_at" timestamp,
	"revoked_at" timestamp,
	CONSTRAINT "staff_permission_override_effect_check" CHECK ("staff_permission_override"."effect" IN ('grant', 'deny'))
);
--> statement-breakpoint
ALTER TABLE "staff_member" ADD CONSTRAINT "staff_member_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_member" ADD CONSTRAINT "staff_member_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_permission_override" ADD CONSTRAINT "staff_permission_override_user_id_staff_member_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."staff_member"("user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_permission_override" ADD CONSTRAINT "staff_permission_override_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "staff_member_role_revoked_idx" ON "staff_member" USING btree ("role","revoked_at");--> statement-breakpoint
CREATE INDEX "staff_permission_override_user_idx" ON "staff_permission_override" USING btree ("user_id");--> statement-breakpoint
INSERT INTO "staff_member" ("user_id", "role", "source")
SELECT "id", 'manager', 'migration' FROM "user" WHERE "role" = 'admin' AND "deleted_at" IS NULL
ON CONFLICT DO NOTHING;
