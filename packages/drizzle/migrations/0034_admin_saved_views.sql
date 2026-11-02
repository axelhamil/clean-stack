CREATE TABLE "saved_view" (
	"id" text PRIMARY KEY NOT NULL,
	"owner_id" text NOT NULL,
	"screen" text NOT NULL,
	"name" text NOT NULL,
	"filters" jsonb NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "saved_view_screen_check" CHECK ("saved_view"."screen" IN ('users', 'orgs', 'audit'))
);
--> statement-breakpoint
ALTER TABLE "saved_view" ADD CONSTRAINT "saved_view_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "saved_view_owner_screen_name_uq" ON "saved_view" USING btree ("owner_id","screen","name");