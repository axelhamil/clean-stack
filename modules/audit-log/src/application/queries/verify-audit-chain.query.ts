import type { IQuery, Option } from "@packages/ddd-kit";
import type { AuditError } from "../ports/repositories/audit-log.port";

export type ChainVerification = {
  verified: boolean;
  rowCount: number;
  brokenAtId: Option<string>;
  brokenAtSequence: Option<number>;
};

export type IVerifyAuditChainQuery = IQuery<void, ChainVerification, AuditError>;
