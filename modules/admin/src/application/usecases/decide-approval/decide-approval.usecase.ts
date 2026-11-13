import { APPROVAL_ACTION_PERMISSION, type ApprovalAction } from "@packages/access-control";
import {
  type AppError,
  EventCollector,
  type IInstrumentation,
  type IUnitOfWork,
  type IUseCase,
  Result,
} from "@packages/ddd-kit";
import {
  APPROVAL_ALREADY_DECIDED,
  APPROVAL_NOT_FOUND,
  type ApprovalAlreadyDecided,
  type ApprovalDecider,
  type ApprovalOutcome,
  type ApprovalRequest,
} from "../../../domain/approval/approval-request.aggregate";
import type { ApprovalStatusInvalid } from "../../../domain/approval/value-objects/approval-status.vo";
import type { StaffEnv } from "../../../domain/staff/services/staff-access.service";
import { staffAccessOf } from "../../../domain/staff/services/staff-access.service";
import {
  type ApprovalHandlers,
  type ApprovedActionOf,
  readApprovedAction,
} from "../../approved-action";
import { approvalRequestOf } from "../../mappers/approval-request.mapper";
import type {
  ApprovalRecord,
  ApprovalStoreError,
  IApprovalStore,
} from "../../ports/repositories/approval-store.port";
import type { IStaffStore, StaffStoreError } from "../../ports/repositories/staff-store.port";
import type { ApprovalDecisionError, DecideApprovalInput } from "./decide-approval.dto";

const REQUESTER_LOST: AppError<"ADMIN_APPROVAL_REQUESTER_LOST_CONFLICT"> = {
  code: "ADMIN_APPROVAL_REQUESTER_LOST_CONFLICT",
  message: "The person who asked no longer holds this power, so the request is closed.",
};

type FailureRecordError = ApprovalStoreError | ApprovalStatusInvalid | ApprovalAlreadyDecided;

interface Decision {
  record: ApprovalRecord;
  request: ApprovalRequest;
  input: DecideApprovalInput;
  outcome: ApprovalOutcome;
}

export class DecideApprovalUseCase
  implements IUseCase<DecideApprovalInput, void, ApprovalDecisionError>
{
  constructor(
    private readonly store: IApprovalStore,
    private readonly staff: IStaffStore,
    private readonly uow: IUnitOfWork,
    private readonly instrumentation: IInstrumentation,
    private readonly handlers: ApprovalHandlers,
    private readonly staffEnv: StaffEnv,
  ) {}

  async execute(input: DecideApprovalInput): Promise<Result<void, ApprovalDecisionError>> {
    const found = await this.store.find(input.approvalId);
    if (found.isFailure) return Result.fail(found.getError());
    if (found.getValue().isNone()) return Result.fail(APPROVAL_NOT_FOUND);

    const record = found.getValue().unwrap();
    const reconstituted = approvalRequestOf(record);
    if (reconstituted.isFailure) return Result.fail(reconstituted.getError());

    const request = reconstituted.getValue();
    const actor = { userId: input.deciderUserId, permissions: input.deciderPermissions };
    const outcome: ApprovalOutcome = input.decision === "approve" ? "approved" : "rejected";
    const decided = request.decide(outcome, actor, input.note, new Date());
    if (decided.isFailure) return Result.fail(decided.getError());

    if (input.decision === "approve") {
      const approved = readApprovedAction(record);
      if (approved.isSuccess) {
        const authorized = await this.authorize(approved.getValue(), actor);
        if (authorized.isFailure) return Result.fail(authorized.getError());
      }
    }

    const decision = { record, request, input, outcome };
    const holds = await this.requesterHolds(record);
    if (holds.isFailure) return Result.fail(holds.getError());
    if (!holds.getValue()) {
      await this.recordFailure(decision, REQUESTER_LOST.code);

      return Result.fail(REQUESTER_LOST);
    }

    return input.decision === "reject" ? this.reject(decision) : this.approve(decision, actor);
  }

  private async requesterHolds(record: ApprovalRecord): Promise<Result<boolean, StaffStoreError>> {
    const found = await this.staff.findActive(record.requestedBy);
    if (found.isFailure) return Result.fail(found.getError());

    const unbanned = found.getValue().filter((row) => !row.banned);
    const permission = APPROVAL_ACTION_PERMISSION[record.action];

    return Result.ok(
      staffAccessOf({ id: record.requestedBy }, unbanned, this.staffEnv)
        .map((access) => access.permissions.includes(permission))
        .unwrapOr(false),
    );
  }

  private reject(decision: Decision): Promise<Result<void, ApprovalDecisionError>> {
    return this.uow.run(async (): Promise<Result<void, ApprovalDecisionError>> => {
      const claimed = await this.claim(decision);
      if (claimed.isFailure) return Result.fail(claimed.getError());

      return Result.ok();
    });
  }

  private async approve(
    decision: Decision,
    actor: ApprovalDecider,
  ): Promise<Result<void, ApprovalDecisionError>> {
    const progress = { claimed: false };

    const outcome = await this.uow.run(async (): Promise<Result<void, ApprovalDecisionError>> => {
      const claimed = await this.claim(decision);
      if (claimed.isFailure) return Result.fail(claimed.getError());
      progress.claimed = true;

      const approved = readApprovedAction(claimed.getValue());
      if (approved.isFailure) return Result.fail(approved.getError());

      const executed = await this.run(approved.getValue(), actor);
      if (executed.isFailure) return Result.fail(executed.getError());

      const { id, version } = claimed.getValue();
      const marked = await this.store.markExecuted(id, version);
      if (marked.isFailure) return Result.fail(marked.getError());
      if (!marked.getValue()) return Result.fail(APPROVAL_ALREADY_DECIDED);

      const executedMark = decision.request.markExecuted(decision.input.deciderUserId, new Date());
      if (executedMark.isFailure) return Result.fail(executedMark.getError());

      EventCollector.collectFrom(decision.request);

      return Result.ok();
    });
    if (outcome.isSuccess || !progress.claimed) return outcome;

    await this.recordFailure(decision, outcome.getError().code);

    return outcome;
  }

  private authorize<K extends ApprovalAction>(
    approved: ApprovedActionOf<K>,
    actor: ApprovalDecider,
  ): Promise<Result<void, AppError>> {
    return this.handlers[approved.action].authorize(approved, actor);
  }

  private run<K extends ApprovalAction>(
    approved: ApprovedActionOf<K>,
    actor: ApprovalDecider,
  ): Promise<Result<void, AppError>> {
    return this.handlers[approved.action].run(approved, actor);
  }

  private async claim({
    request,
    input,
    outcome,
  }: Decision): Promise<Result<ApprovalRecord, ApprovalDecisionError>> {
    const claimed = await this.store.claim({
      id: input.approvalId,
      status: outcome,
      decidedBy: input.deciderUserId,
      note: input.note,
    });
    if (claimed.isFailure) return Result.fail(claimed.getError());
    if (claimed.getValue().isNone()) return Result.fail(APPROVAL_ALREADY_DECIDED);

    EventCollector.collectFrom(request);

    return Result.ok(claimed.getValue().unwrap());
  }

  private async recordFailure({ record, input }: Decision, reason: string): Promise<void> {
    try {
      const recorded = await this.uow.run(async (): Promise<Result<void, FailureRecordError>> => {
        const marked = await this.store.markFailed({
          id: record.id,
          decidedBy: input.deciderUserId,
          note: input.note,
          reason,
        });
        if (marked.isFailure) return Result.fail(marked.getError());
        if (!marked.getValue()) return Result.ok();

        const failed = approvalRequestOf(record);
        if (failed.isFailure) return Result.fail(failed.getError());

        const settled = failed.getValue().markFailed(input.deciderUserId, reason, new Date());
        if (settled.isFailure) return Result.fail(settled.getError());

        EventCollector.collectFrom(failed.getValue());

        return Result.ok();
      });
      if (recorded.isFailure) this.instrumentation.capture(recorded.getError());
    } catch (err) {
      this.instrumentation.capture(err);
    }
  }
}
