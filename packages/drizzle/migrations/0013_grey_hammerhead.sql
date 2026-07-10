ALTER TABLE "audit_log" ADD COLUMN "sequence" bigserial NOT NULL;--> statement-breakpoint
CREATE INDEX "audit_log_sequence_idx" ON "audit_log" USING btree ("sequence");