ALTER TABLE "user" ADD COLUMN "pending_deletion_until" timestamp;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "deleted_at" timestamp;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "last_export_requested_at" timestamp;