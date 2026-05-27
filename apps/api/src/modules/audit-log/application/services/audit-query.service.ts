import type { Result } from "@packages/ddd-kit";
import type {
  AuditError,
  AuditFilters,
  AuditPage,
  IAuditPort,
} from "../../../../shared/ports/audit.port";
import type { IInstrumentation } from "../../../../shared/ports/instrumentation.port";

export class AuditQueryService {
  constructor(
    private readonly audit: IAuditPort,
    private readonly instrumentation: IInstrumentation,
  ) {}

  async listForOrg(
    organizationId: string,
    filters: Omit<AuditFilters, "organizationId">,
  ): Promise<Result<AuditPage, AuditError>> {
    return this.instrumentation.startSpan({ name: "AuditQueryService > listForOrg" }, () =>
      this.audit.list({ ...filters, organizationId }),
    );
  }
}
