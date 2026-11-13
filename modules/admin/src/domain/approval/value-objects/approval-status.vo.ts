import { type AppError, Option, Result, ValueObject } from "@packages/ddd-kit";
import { z } from "zod";

export const APPROVAL_STATUSES = [
  "pending",
  "approved",
  "rejected",
  "cancelled",
  "expired",
  "executed",
  "failed",
] as const;

export type ApprovalStatusValue = (typeof APPROVAL_STATUSES)[number];

export type SettledStatusValue = Exclude<ApprovalStatusValue, "pending">;

const approvalStatusSchema = z.enum(APPROVAL_STATUSES);

const SETTLED_FROM: Record<SettledStatusValue, ApprovalStatusValue> = {
  approved: "pending",
  rejected: "pending",
  cancelled: "pending",
  expired: "pending",
  failed: "pending",
  executed: "approved",
};

export type ApprovalStatusInvalid = AppError<"ADMIN_APPROVAL_STATUS_INVALID">;

const STATUS_INVALID: ApprovalStatusInvalid = {
  code: "ADMIN_APPROVAL_STATUS_INVALID",
  message: `An approval status is one of ${APPROVAL_STATUSES.join(", ")}.`,
};

export class ApprovalStatus extends ValueObject<ApprovalStatusValue, ApprovalStatusInvalid> {
  static parse(value: unknown): Result<ApprovalStatus, ApprovalStatusInvalid> {
    const parsed = approvalStatusSchema.safeParse(value);
    if (!parsed.success) return Result.fail(STATUS_INVALID);

    return ApprovalStatus.create(parsed.data);
  }

  isPending(): boolean {
    return this.value === "pending";
  }

  becomes(next: SettledStatusValue): Option<ApprovalStatus> {
    if (this.value !== SETTLED_FROM[next]) return Option.none();

    return Option.some(new ApprovalStatus(next));
  }

  protected validate(
    value: ApprovalStatusValue,
  ): Result<ApprovalStatusValue, ApprovalStatusInvalid> {
    return approvalStatusSchema.safeParse(value).success
      ? Result.ok(value)
      : Result.fail(STATUS_INVALID);
  }
}
