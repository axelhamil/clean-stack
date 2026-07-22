CREATE TABLE "quota_usage" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"resource" text NOT NULL,
	"used" integer DEFAULT 0 NOT NULL,
	"period_start" timestamp NOT NULL,
	"period_end" timestamp NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "quota_usage" ADD CONSTRAINT "quota_usage_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "quota_usage_org_resource_period_uq" ON "quota_usage" USING btree ("organization_id","resource","period_start");--> statement-breakpoint
CREATE INDEX "quota_usage_org_resource_idx" ON "quota_usage" USING btree ("organization_id","resource");