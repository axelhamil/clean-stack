import type {
  ApprovalAlreadyDecided,
  ApprovalNotFound,
} from "../../../domain/approval/approval-request.aggregate";
import type { ApprovalStatusInvalid } from "../../../domain/approval/value-objects/approval-status.vo";
import type { ApprovalStoreError } from "../../ports/repositories/approval-store.port";

export interface CloseApprovalsOfDeletedUserInput {
  userId: string;
}

export type CloseApprovalsOfDeletedUserError =
  | ApprovalStoreError
  | ApprovalStatusInvalid
  | ApprovalNotFound
  | ApprovalAlreadyDecided;
