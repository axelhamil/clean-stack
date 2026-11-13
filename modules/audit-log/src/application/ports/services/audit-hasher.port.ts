export const GENESIS_HASH = "GENESIS";

export interface AuditHashInput {
  id: string;
  action: string;
  actorId: string | null;
  actorType: string;
  organizationId: string | null;
  targetType: string;
  targetId: string;
  metadata: unknown;
  occurredAt: string;
  requestId: string | null;
  retention: string;
  prevHash: string;
}

export interface IAuditHasher {
  hash(input: AuditHashInput): string;
}
