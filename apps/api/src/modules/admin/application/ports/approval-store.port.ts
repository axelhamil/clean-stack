import type { ApprovalAction } from "@packages/access-control";
import type { AppError, Option, Result } from "@packages/ddd-kit";
import type { ListApprovalsInput } from "../dto/list-approvals.dto";

export const APPROVAL_STATUSES = [
  "pending",
  "approved",
  "rejected",
  "cancelled",
  "expired",
  "executed",
  "failed",
] as const;

export type ApprovalStatus = (typeof APPROVAL_STATUSES)[number];

export type ApprovalStoreError = AppError<"ADMIN_APPROVAL_PROVIDER_FAILURE">;

export interface ApprovalRecord {
  id: string;
  action: ApprovalAction;
  subjectId: string;
  params: unknown;
  requestedBy: string;
  status: ApprovalStatus;
  decidedBy: Option<string>;
  decisionNote: Option<string>;
  failureReason: Option<string>;
  expiresAt: Date;
  decidedAt: Option<Date>;
  createdAt: Date;
  version: number;
}

export interface ApprovalWrite {
  action: ApprovalAction;
  subjectId: string;
  params: unknown;
  requestedBy: string;
  ttlHours: number;
}

export interface ApprovalClaim {
  id: string;
  status: "approved" | "rejected";
  decidedBy: string;
  note: string;
}

export interface ApprovalFailure {
  id: string;
  decidedBy: string;
  note: string;
  reason: string;
}

export interface IApprovalStore {
  create(input: ApprovalWrite): Promise<Result<ApprovalRecord, ApprovalStoreError>>;
  find(id: string): Promise<Result<Option<ApprovalRecord>, ApprovalStoreError>>;
  list(input: ListApprovalsInput): Promise<Result<ApprovalRecord[], ApprovalStoreError>>;
  claim(input: ApprovalClaim): Promise<Result<Option<ApprovalRecord>, ApprovalStoreError>>;
  cancel(
    id: string,
    requestedBy: string,
  ): Promise<Result<Option<ApprovalRecord>, ApprovalStoreError>>;
  markExecuted(id: string, version: number): Promise<Result<boolean, ApprovalStoreError>>;
  markFailed(input: ApprovalFailure): Promise<Result<boolean, ApprovalStoreError>>;
  expireDue(limit: number): Promise<Result<ApprovalRecord[], ApprovalStoreError>>;
  countDue(): Promise<Result<number, ApprovalStoreError>>;
}
