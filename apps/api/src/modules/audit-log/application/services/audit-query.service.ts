import type { IInstrumentation, Result } from "@packages/ddd-kit";
import type {
  AuditError,
  AuditFilters,
  AuditPage,
  ChainVerification,
  IAuditPort,
} from "../../../../shared/ports/audit.port";

export class AuditQueryService {
  constructor(
    private readonly audit: IAuditPort,
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
