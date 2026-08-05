import type { AppError, Option, Result } from "@packages/ddd-kit";
import type { AuditActorType, AuditRetention } from "@packages/drizzle";
import type { ITransaction } from "../transaction";

export type AuditError = AppError<"AUDIT_PERSISTENCE_PROVIDER_FAILURE">;

export type AuditEntry = {
  actorId: Option<string>;
  actorType: AuditActorType;
  organizationId: Option<string>;
  action: string;
  targetType: string;
  targetId: string;
  metadata: unknown;
  requestId?: string;
  retention: AuditRetention;
};

export type AuditRecord = AuditEntry & {
  id: string;
  occurredAt: Date;
  prevHash: Option<string>;
  hash: Option<string>;
};

export type AuditFilters = {
  actorId?: string;
  organizationId?: string | null;
  targetType?: string;
  targetId?: string;
  actionPrefix?: string;
  occurredFrom?: Date;
  occurredTo?: Date;
  limit?: number;
  cursor?: string;
};

export type AuditPage = {
  items: AuditRecord[];
  nextCursor: Option<string>;
};

export type ChainVerification = {
  verified: boolean;
  rowCount: number;
  brokenAtId: Option<string>;
  brokenAtSequence: Option<number>;
};

export interface IAuditPort {
  record(entry: AuditEntry, tx?: ITransaction): Promise<Result<AuditRecord, AuditError>>;
  list(filters: AuditFilters, tx?: ITransaction): Promise<Result<AuditPage, AuditError>>;
  verifyChain(tx?: ITransaction): Promise<Result<ChainVerification, AuditError>>;
}
