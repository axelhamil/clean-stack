import { Option, Result } from "@packages/ddd-kit";
import { ApprovalRequest } from "../../domain/approval/approval-request.aggregate";
import { ApprovalRequestId } from "../../domain/approval/approval-request-id";
import {
  ApprovalStatus,
  type ApprovalStatusInvalid,
} from "../../domain/approval/value-objects/approval-status.vo";
import type { ApprovalRecord } from "../ports/repositories/approval-store.port";

export function approvalRequestOf(
  record: ApprovalRecord,
): Result<ApprovalRequest, ApprovalStatusInvalid> {
  const { id, status, ...props } = record;
  const validated: Result<ApprovalStatus, ApprovalStatusInvalid> = ApprovalStatus.create(status);

  return validated.map((approvalStatus) =>
    ApprovalRequest.reconstitute({ ...props, status: approvalStatus }, new ApprovalRequestId(id)),
  );
}

export function pendingRequestsOf(
  settled: ApprovalRecord[],
): Result<ApprovalRequest[], ApprovalStatusInvalid> {
  return Result.all(
    settled.map((record) =>
      approvalRequestOf({ ...record, status: "pending", decidedAt: Option.none() }),
    ),
  );
}
