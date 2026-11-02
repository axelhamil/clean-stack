import { auditViewFiltersSchema } from "@packages/access-control";
import { z } from "zod";

export const AUDIT_ACTION_PREFIXES = {
  "user.": "auditLog.actionPrefix.user",
  "org.": "auditLog.actionPrefix.org",
  "billing.": "auditLog.actionPrefix.billing",
  "security.": "auditLog.actionPrefix.security",
  "webhook.": "auditLog.actionPrefix.webhook",
  "admin.": "auditLog.actionPrefix.admin",
} as const;

export const auditSearchSchema = z.object({
  action: auditViewFiltersSchema.shape.action.catch(undefined),
  actor: auditViewFiltersSchema.shape.actor.catch(undefined),
  org: auditViewFiltersSchema.shape.org.catch(undefined),
  from: auditViewFiltersSchema.shape.from.catch(undefined),
  to: auditViewFiltersSchema.shape.to.catch(undefined),
});

export type AuditSearch = z.infer<typeof auditSearchSchema>;

export interface AuditQuery {
  actionPrefix?: string;
  actorId?: string;
  organizationId?: string;
  occurredFrom?: string;
  occurredTo?: string;
}

export function auditQueryOf(search: AuditSearch): AuditQuery {
  const actor = search.actor?.trim();
  const org = search.org?.trim();

  return {
    ...(search.action ? { actionPrefix: search.action } : {}),
    ...(actor ? { actorId: actor } : {}),
    ...(org ? { organizationId: org } : {}),
    ...(search.from ? { occurredFrom: new Date(`${search.from}T00:00:00`).toISOString() } : {}),
    ...(search.to ? { occurredTo: new Date(`${search.to}T23:59:59.999`).toISOString() } : {}),
  };
}
