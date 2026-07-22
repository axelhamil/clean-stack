import { CryptoHasher } from "bun";

export const GENESIS_HASH = "GENESIS";

export function canonicalize(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(",")}]`;
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalize(record[k])}`).join(",")}}`;
}

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

export function computeAuditHash(input: AuditHashInput): string {
  return new CryptoHasher("sha256").update(canonicalize(input)).digest("hex");
}
