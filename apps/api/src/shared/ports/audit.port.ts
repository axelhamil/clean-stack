import type { AuditActorType, AuditRetention } from "@packages/drizzle";
import type { ITransaction } from "../transaction";

export type AuditEntry = {
  actorId: string | null;
  actorType: AuditActorType;
  organizationId: string | null;
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
  prevHash: string | null;
  hash: string | null;
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
  nextCursor: string | null;
};

export interface IAuditPort {
  record(entry: AuditEntry, tx?: ITransaction): Promise<AuditRecord>;
  list(filters: AuditFilters, tx?: ITransaction): Promise<AuditPage>;
}
