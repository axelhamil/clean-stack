import type { ApprovalAlreadyDecided } from "../../../domain/approval/approval-request.aggregate";
import type { ApprovalStatusInvalid } from "../../../domain/approval/value-objects/approval-status.vo";
import type { ApprovalStoreError } from "../../ports/repositories/approval-store.port";

export interface ExpireApprovalsInput {
  batchSize: number;
}

export type ExpireApprovalsError =
  | ApprovalStoreError
  | ApprovalStatusInvalid
  | ApprovalAlreadyDecided;
