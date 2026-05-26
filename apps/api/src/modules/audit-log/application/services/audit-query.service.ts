import type { Result } from "@packages/ddd-kit";
import type {
  AuditError,
  AuditFilters,
  AuditPage,
  IAuditPort,
} from "../../../../shared/ports/audit.port";

export class AuditQueryService {
  constructor(private readonly audit: IAuditPort) {}

  async listForOrg(
    organizationId: string,
    filters: Omit<AuditFilters, "organizationId">,
  ): Promise<Result<AuditPage, AuditError>> {
    return this.audit.list({ ...filters, organizationId });
  }
}
