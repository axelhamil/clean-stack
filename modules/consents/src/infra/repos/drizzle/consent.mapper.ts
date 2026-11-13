import { Option } from "@packages/ddd-kit";
import type * as consentSchema from "../../../../schemas/consent";
import type { ConsentRecord } from "../../../application/ports/repositories/consent.port";

type ConsentRow = typeof consentSchema.consentRecord.$inferSelect;
type ConsentInsert = typeof consentSchema.consentRecord.$inferInsert;

export function toConsentRecord(row: ConsentRow): ConsentRecord {
  return {
    id: row.id,
    subjectId: row.subjectId,
    userId: Option.fromNullable(row.userId),
    categories: row.categories,
    policyVersion: row.policyVersion,
    grantedAt: row.grantedAt,
    withdrawnAt: Option.fromNullable(row.withdrawnAt),
    expiresAt: row.expiresAt,
    ipAddress: Option.fromNullable(row.ipAddress),
    userAgent: Option.fromNullable(row.userAgent),
  };
}

export function toConsentRow(record: ConsentRecord): ConsentInsert {
  return {
    id: record.id,
    subjectId: record.subjectId,
    userId: record.userId.toNull(),
    categories: record.categories,
    policyVersion: record.policyVersion,
    grantedAt: record.grantedAt,
    withdrawnAt: record.withdrawnAt.toNull(),
    expiresAt: record.expiresAt,
    ipAddress: record.ipAddress.toNull(),
    userAgent: record.userAgent.toNull(),
  };
}
