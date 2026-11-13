import type { IQuery, Option } from "@packages/ddd-kit";
import type { ApprovalRecord, ApprovalStoreError } from "../ports/repositories/approval-store.port";

export type IGetApprovalQuery = IQuery<
  { approvalId: string },
  Option<ApprovalRecord>,
  ApprovalStoreError
>;
