export interface AuditLogFilters {
  actionPrefix?: string;
  actorId?: string;
  organizationId?: string;
  occurredFrom?: string;
  occurredTo?: string;
}

export function serializeFilters(filters: AuditLogFilters): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(filters)) {
    if (typeof v === "string" && v.length > 0) out[k] = v;
  }
  return out;
}
