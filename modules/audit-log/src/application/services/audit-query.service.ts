import type { Result } from "@packages/ddd-kit";
import type { AuditError } from "../ports/repositories/audit-log.port";
import type {
  AuditFilters,
  AuditPage,
  IListAuditEventsQuery,
} from "../queries/list-audit-events.query";
import type {
  ChainVerification,
  IVerifyAuditChainQuery,
} from "../queries/verify-audit-chain.query";

export class AuditQueryService {
  constructor(
    private readonly listAuditEvents: IListAuditEventsQuery,
    private readonly verifyAuditChain: IVerifyAuditChainQuery,
  ) {}

  listForPlatform(filters: AuditFilters): Promise<Result<AuditPage, AuditError>> {
    return this.listAuditEvents.execute(filters);
  }

  verifyChain(): Promise<Result<ChainVerification, AuditError>> {
    return this.verifyAuditChain.execute();
  }
}
