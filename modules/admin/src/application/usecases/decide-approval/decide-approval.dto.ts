import type { StaffPermission } from "@packages/access-control";
import type { AppError } from "@packages/ddd-kit";
import type {
  ApprovalNotFound,
  ApprovalRefusal,
} from "../../../domain/approval/approval-request.aggregate";
import type { ApprovalStoreError } from "../../ports/repositories/approval-store.port";
import type { StaffStoreError } from "../../ports/repositories/staff-store.port";

export interface DecideApprovalInput {
  approvalId: string;
  deciderUserId: string;
  deciderPermissions: readonly StaffPermission[];
  decision: "approve" | "reject";
  note: string;
}

export type ApprovalDecisionError =
  | AppError
  | ApprovalStoreError
  | StaffStoreError
  | ApprovalNotFound
  | ApprovalRefusal
  | AppError<"ADMIN_APPROVAL_REQUESTER_LOST_CONFLICT">
  | AppError<"ADMIN_APPROVAL_PARAMS_INVALID">;
