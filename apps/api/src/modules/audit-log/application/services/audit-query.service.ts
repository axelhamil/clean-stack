import type { AuditFilters, AuditPage, IAuditPort } from "../../../../shared/ports/audit.port";

export class AuditQueryService {
  constructor(private readonly audit: IAuditPort) {}

  async listForOrg(
    organizationId: string,
    filters: Omit<AuditFilters, "organizationId">,
  ): Promise<AuditPage> {
    return this.audit.list({ ...filters, organizationId });
  }
}
