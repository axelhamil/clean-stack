import type { IInstrumentation, Result } from "@packages/ddd-kit";
import type {
  AuditError,
  AuditFilters,
  AuditPage,
  ChainVerification,
} from "../../../../shared/ports/audit.port";
import type { IAuditTrail } from "../ports/audit-trail.port";

export class AuditQueryService {
  constructor(
    private readonly audit: IAuditTrail,
    private readonly instrumentation: IInstrumentation,
  ) {}

  async listForPlatform(filters: AuditFilters): Promise<Result<AuditPage, AuditError>> {
    return this.instrumentation.startSpan({ name: "AuditQueryService > listForPlatform" }, () =>
      this.audit.list(filters),
    );
  }

  async verifyChain(): Promise<Result<ChainVerification, AuditError>> {
    return this.instrumentation.startSpan({ name: "AuditQueryService > verifyChain" }, () =>
      this.audit.verifyChain(),
    );
  }
}
