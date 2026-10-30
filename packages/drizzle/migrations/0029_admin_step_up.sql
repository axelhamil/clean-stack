CREATE TABLE "admin_step_up" (
	"session_id" text PRIMARY KEY NOT NULL,
	"verified_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "admin_totp_counter" (
	"user_id" text PRIMARY KEY NOT NULL,
	"last_counter" bigint NOT NULL
);
--> statement-breakpoint
ALTER TABLE "admin_step_up" ADD CONSTRAINT "admin_step_up_session_id_session_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."session"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_totp_counter" ADD CONSTRAINT "admin_totp_counter_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;