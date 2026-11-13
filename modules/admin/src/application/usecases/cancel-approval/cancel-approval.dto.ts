import type {
  ApprovalAlreadyDecided,
  ApprovalNotFound,
} from "../../../domain/approval/approval-request.aggregate";
import type { ApprovalStatusInvalid } from "../../../domain/approval/value-objects/approval-status.vo";
import type { ApprovalStoreError } from "../../ports/repositories/approval-store.port";

export interface CancelApprovalInput {
  approvalId: string;
  userId: string;
}

export type CancelApprovalError =
  | ApprovalStoreError
  | ApprovalStatusInvalid
  | ApprovalNotFound
  | ApprovalAlreadyDecided;
