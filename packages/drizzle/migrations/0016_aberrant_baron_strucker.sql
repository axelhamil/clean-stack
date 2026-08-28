-- api_token / notification / notification_preference already exist on any database that
-- ran `pnpm db:push` after their schema files landed on `dev`, with no matching
-- __drizzle_migrations row (pre-existing drift, unrelated to sso/scim — see task-1-report.md).
-- Guarded with IF NOT EXISTS / existence checks so this migration applies cleanly on both
-- a fresh database and a drifted one. sso_provider / scim_provider are new in every
-- starting state and stay unguarded — a genuine collision there must still fail loudly.
CREATE TABLE IF NOT EXISTS "api_token" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"organization_id" text,
	"name" text NOT NULL,
	"scopes" jsonb NOT NULL,
	"token_hmac" text NOT NULL,
	"pepper_version" smallint DEFAULT 1 NOT NULL,
	"token_start" text NOT NULL,
	"last_used_at" timestamp,
	"expires_at" timestamp,
	"revoked_at" timestamp,
	"revoked_reason" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "notification" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"organization_id" text,
	"category" text NOT NULL,
	"event_type" text NOT NULL,
	"group_key" text,
	"dedup_key" text,
	"payload" jsonb NOT NULL,
	"read_at" timestamp,
	"email_pending_at" timestamp,
	"email_sent_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "notification_preference" (
	"id" text PRIMARY KEY NOT NULL,
	"scope" text NOT NULL,
	"scope_id" text NOT NULL,
	"category" text NOT NULL,
	"channel" text NOT NULL,
	"enabled" boolean NOT NULL,
	"frequency" text DEFAULT 'immediate' NOT NULL,
	"locked" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "scim_provider" (
	"id" text PRIMARY KEY NOT NULL,
	"provider_id" text NOT NULL,
	"scim_token" text NOT NULL,
	"organization_id" text,
	"user_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sso_provider" (
	"id" text PRIMARY KEY NOT NULL,
	"issuer" text NOT NULL,
	"oidc_config" text,
	"saml_config" text,
	"user_id" text,
	"provider_id" text NOT NULL,
	"organization_id" text,
	"domain" text NOT NULL,
	"domain_verified" boolean DEFAULT false,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
	IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'api_token_user_id_user_id_fk') THEN
		ALTER TABLE "api_token" ADD CONSTRAINT "api_token_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
	END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
	IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'api_token_organization_id_organization_id_fk') THEN
		ALTER TABLE "api_token" ADD CONSTRAINT "api_token_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;
	END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
	IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'notification_user_id_user_id_fk') THEN
		ALTER TABLE "notification" ADD CONSTRAINT "notification_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
	END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
	IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'notification_organization_id_organization_id_fk') THEN
		ALTER TABLE "notification" ADD CONSTRAINT "notification_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;
	END IF;
END $$;
--> statement-breakpoint
ALTER TABLE "scim_provider" ADD CONSTRAINT "scim_provider_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scim_provider" ADD CONSTRAINT "scim_provider_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sso_provider" ADD CONSTRAINT "sso_provider_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sso_provider" ADD CONSTRAINT "sso_provider_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "api_token_hmac_uidx" ON "api_token" USING btree ("token_hmac");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "api_token_user_idx" ON "api_token" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "api_token_org_idx" ON "api_token" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "notification_unread_idx" ON "notification" USING btree ("user_id") WHERE "notification"."read_at" IS NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "notification_feed_idx" ON "notification" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "notification_dedup_uidx" ON "notification" USING btree ("user_id","dedup_key") WHERE "notification"."dedup_key" IS NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "notification_email_pending_idx" ON "notification" USING btree ("email_pending_at") WHERE "notification"."email_sent_at" IS NULL AND "notification"."email_pending_at" IS NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "notification_sweep_idx" ON "notification" USING btree ("created_at") WHERE "notification"."read_at" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "notification_preference_uidx" ON "notification_preference" USING btree ("scope","scope_id","category","channel");--> statement-breakpoint
CREATE UNIQUE INDEX "scim_provider_provider_id_uidx" ON "scim_provider" USING btree ("provider_id");--> statement-breakpoint
CREATE UNIQUE INDEX "scim_provider_token_uidx" ON "scim_provider" USING btree ("scim_token");--> statement-breakpoint
CREATE UNIQUE INDEX "sso_provider_provider_id_uidx" ON "sso_provider" USING btree ("provider_id");
