import { z } from "zod";

export const AUDIT_ACTION_PREFIXES = {
  "user.": "auditLog.actionPrefix.user",
  "org.": "auditLog.actionPrefix.org",
  "billing.": "auditLog.actionPrefix.billing",
  "security.": "auditLog.actionPrefix.security",
  "webhook.": "auditLog.actionPrefix.webhook",
  "admin.": "auditLog.actionPrefix.admin",
} as const;

const prefixSchema = z.enum(["user.", "org.", "billing.", "security.", "webhook.", "admin."]);

export const auditSearchSchema = z.object({
  action: prefixSchema.optional().catch(undefined),
  actor: z.string().optional().catch(undefined),
  org: z.string().optional().catch(undefined),
  from: z.iso.date().optional().catch(undefined),
  to: z.iso.date().optional().catch(undefined),
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
