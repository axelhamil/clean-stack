DROP INDEX "audit_log_actor_time_idx";--> statement-breakpoint
DROP INDEX "audit_log_action_time_idx";--> statement-breakpoint
DROP INDEX "audit_log_org_time_idx";--> statement-breakpoint
DROP INDEX "policy_acceptance_user_type_time_idx";--> statement-breakpoint
CREATE INDEX "webhook_delivery_sweep_idx" ON "webhook_delivery" USING btree ("created_at") WHERE "webhook_delivery"."status" IN ('success', 'dead_letter');--> statement-breakpoint
CREATE INDEX "audit_log_actor_time_idx" ON "audit_log" USING btree ("actor_id","occurred_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "audit_log_action_time_idx" ON "audit_log" USING btree ("action","occurred_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "audit_log_org_time_idx" ON "audit_log" USING btree ("organization_id","occurred_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "policy_acceptance_user_type_time_idx" ON "policy_acceptance" USING btree ("user_id","policy_type","accepted_at" DESC NULLS LAST);