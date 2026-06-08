CREATE TABLE "policy_acceptance" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"policy_type" text NOT NULL,
	"policy_version" text NOT NULL,
	"ip_address" text,
	"accepted_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "policy_acceptance" ADD CONSTRAINT "policy_acceptance_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "policy_acceptance_user_type_time_idx" ON "policy_acceptance" USING btree ("user_id","policy_type","accepted_at" DESC);