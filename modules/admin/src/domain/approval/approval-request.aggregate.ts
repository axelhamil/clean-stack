import {
  APPROVAL_ACTION_PERMISSION,
  type ApprovalAction,
  type StaffPermission,
} from "@packages/access-control";
import { Aggregate, type AppError, Option, Result } from "@packages/ddd-kit";
import type { ApprovalRef } from "./approval-ref";
import type { ApprovalRequestId } from "./approval-request-id";
import { approvalCancelledEvent } from "./events/approval-cancelled.event";
import { approvalDecidedEvent } from "./events/approval-decided.event";
import { approvalExecutedEvent } from "./events/approval-executed.event";
import { approvalExpiredEvent } from "./events/approval-expired.event";
import { approvalFailedEvent } from "./events/approval-failed.event";
import { approvalRequestedEvent } from "./events/approval-requested.event";
import type { ApprovalStatus, SettledStatusValue } from "./value-objects/approval-status.vo";

export interface ApprovalRequestProps {
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

export interface ApprovalDecider {
  userId: string;
  permissions: readonly StaffPermission[];
}

export type ApprovalOutcome = "approved" | "rejected";

export type ApprovalNotFound = AppError<"ADMIN_APPROVAL_NOT_FOUND">;

export type ApprovalAlreadyDecided = AppError<"ADMIN_APPROVAL_DECIDED_CONFLICT">;

export type ApprovalRefusal =
  | ApprovalAlreadyDecided
  | AppError<"ADMIN_APPROVAL_SELF_DECISION_FORBIDDEN">
  | AppError<"ADMIN_APPROVAL_SUBJECT_DECISION_FORBIDDEN">
  | AppError<"ADMIN_APPROVAL_PERMISSION_FORBIDDEN">
  | AppError<"ADMIN_APPROVAL_EXPIRED_CONFLICT">;

export const APPROVAL_NOT_FOUND: ApprovalNotFound = {
  code: "ADMIN_APPROVAL_NOT_FOUND",
  message: "This approval request does not exist.",
};

export const APPROVAL_ALREADY_DECIDED: ApprovalAlreadyDecided = {
  code: "ADMIN_APPROVAL_DECIDED_CONFLICT",
  message: "This request has already been settled.",
};

const EXPIRED: AppError<"ADMIN_APPROVAL_EXPIRED_CONFLICT"> = {
  code: "ADMIN_APPROVAL_EXPIRED_CONFLICT",
  message: "This request has expired. Ask again if the action is still needed.",
};

export class ApprovalRequest extends Aggregate<ApprovalRequestProps, ApprovalRequestId> {
  private constructor(props: ApprovalRequestProps, id: ApprovalRequestId) {
    super(props, id);
  }

  static reconstitute(props: ApprovalRequestProps, id: ApprovalRequestId): ApprovalRequest {
    return new ApprovalRequest(props, id);
  }

  isRequestedBy(userId: string): boolean {
    return this._props.requestedBy === userId;
  }

  isOver(now: Date): boolean {
    return this._props.expiresAt.getTime() <= now.getTime();
  }

  decide(
    outcome: ApprovalOutcome,
    decider: ApprovalDecider,
    note: string,
    now: Date,
  ): Result<void, ApprovalRefusal> {
    const refused = this.decisionRefusal(decider, now);
    if (refused.isSome()) return Result.fail(refused.unwrap());

    const settled = this.settle(outcome, now);
    if (settled.isFailure) return settled;

    this._props.decidedBy = Option.some(decider.userId);
    this._props.decisionNote = Option.some(note);
    this.addEvent(
      approvalDecidedEvent({ ...this.ref(), actorUserId: decider.userId, outcome, note }, now),
    );

    return Result.ok();
  }

  request(now: Date): void {
    this.addEvent(
      approvalRequestedEvent({ ...this.ref(), actorUserId: this._props.requestedBy }, now),
    );
  }

  markExecuted(decider: string, now: Date): Result<void, ApprovalAlreadyDecided> {
    const moved = this.moveTo("executed");
    if (moved.isFailure) return moved;

    this.addEvent(approvalExecutedEvent({ ...this.ref(), actorUserId: decider }, now));

    return Result.ok();
  }

  markFailed(decider: string, reason: string, now: Date): Result<void, ApprovalAlreadyDecided> {
    const settled = this.settle("failed", now);
    if (settled.isFailure) return settled;

    this._props.failureReason = Option.some(reason);
    this.addEvent(approvalFailedEvent({ ...this.ref(), actorUserId: decider, reason }, now));

    return Result.ok();
  }

  cancel(
    actorUserId: string | null,
    now: Date,
  ): Result<void, ApprovalNotFound | ApprovalAlreadyDecided> {
    if (actorUserId !== null && !this.isRequestedBy(actorUserId)) {
      return Result.fail(APPROVAL_NOT_FOUND);
    }

    const settled = this.settle("cancelled", now);
    if (settled.isFailure) return settled;

    this.addEvent(approvalCancelledEvent({ ...this.ref(), actorUserId }, now));

    return Result.ok();
  }

  expire(now: Date): Result<void, ApprovalAlreadyDecided> {
    const settled = this.settle("expired", now);
    if (settled.isFailure) return settled;

    this.addEvent(approvalExpiredEvent({ ...this.ref(), actorUserId: null }, now));

    return Result.ok();
  }

  private decisionRefusal(decider: ApprovalDecider, now: Date): Option<ApprovalRefusal> {
    if (this.isRequestedBy(decider.userId)) {
      return Option.some({
        code: "ADMIN_APPROVAL_SELF_DECISION_FORBIDDEN",
        message: "A different person must decide this request.",
      });
    }

    if (this._props.subjectId === decider.userId) {
      return Option.some({
        code: "ADMIN_APPROVAL_SUBJECT_DECISION_FORBIDDEN",
        message: "Nobody decides a request about their own account.",
      });
    }

    const permission = APPROVAL_ACTION_PERMISSION[this._props.action];
    if (!decider.permissions.includes(permission)) {
      return Option.some({
        code: "ADMIN_APPROVAL_PERMISSION_FORBIDDEN",
        message: `Deciding this request requires the ${permission} permission.`,
      });
    }

    if (!this._props.status.isPending()) return Option.some(APPROVAL_ALREADY_DECIDED);
    if (this.isOver(now)) return Option.some(EXPIRED);

    return Option.none();
  }

  private settle(
    status: Exclude<SettledStatusValue, "executed">,
    now: Date,
  ): Result<void, ApprovalAlreadyDecided> {
    const moved = this.moveTo(status);
    if (moved.isFailure) return moved;

    this._props.decidedAt = Option.some(now);

    return Result.ok();
  }

  private moveTo(status: SettledStatusValue): Result<void, ApprovalAlreadyDecided> {
    const next = this._props.status.becomes(status);
    if (next.isNone()) return Result.fail(APPROVAL_ALREADY_DECIDED);

    this._props.status = next.unwrap();

    return Result.ok();
  }

  private ref(): ApprovalRef {
    return {
      approvalId: this.id.value,
      action: this._props.action,
      requesterUserId: this._props.requestedBy,
      userId: this._props.subjectId,
    };
  }
}
