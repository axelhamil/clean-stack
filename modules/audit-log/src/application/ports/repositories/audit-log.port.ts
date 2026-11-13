import type { AppError, Option, Result } from "@packages/ddd-kit";
import type { AuditActorType, AuditRetention } from "@packages/events";

export type AuditError = AppError<"AUDIT_PERSISTENCE_PROVIDER_FAILURE">;

export type AuditEntry = {
  id: string;
  action: string;
  actorId: Option<string>;
  actorType: AuditActorType;
  organizationId: Option<string>;
  targetType: string;
  targetId: string;
  metadata: unknown;
  occurredAt: Date;
  requestId: Option<string>;
  retention: AuditRetention;
};

export type AuditRecord = AuditEntry & {
  prevHash: Option<string>;
  hash: Option<string>;
};

export interface IAuditLogRepository {
  lockChain(): Promise<Result<void, AuditError>>;
  lastChainHash(): Promise<Result<Option<string>, AuditError>>;
  append(record: AuditRecord): Promise<Result<void, AuditError>>;
}
