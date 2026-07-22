CREATE TABLE "consent_record" (
	"id" text PRIMARY KEY NOT NULL,
	"subject_id" text NOT NULL,
	"user_id" text,
	"categories" jsonb NOT NULL,
	"policy_version" text NOT NULL,
	"granted_at" timestamp DEFAULT now() NOT NULL,
	"withdrawn_at" timestamp,
	"expires_at" timestamp NOT NULL,
	"ip_address" text,
	"user_agent" text
);
--> statement-breakpoint
ALTER TABLE "consent_record" ADD CONSTRAINT "consent_record_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "consent_record_subject_expires_idx" ON "consent_record" USING btree ("subject_id","expires_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "consent_record_user_expires_idx" ON "consent_record" USING btree ("user_id","expires_at" DESC NULLS LAST);