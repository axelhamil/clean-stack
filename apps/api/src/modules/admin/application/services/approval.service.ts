import {
  APPROVAL_ACTION_PERMISSION,
  type ApprovalAction,
  type StaffPermission,
} from "@packages/access-control";
import { type AppError, type IUnitOfWork, Option, Result } from "@packages/ddd-kit";
import { type EventType, EventTypes } from "@packages/events";
import { emitEvent } from "../../../../shared/event-emitter";
import type { IInstrumentation } from "../../../../shared/ports/instrumentation.port";
import type { IOutboxRepository } from "../../../../shared/ports/outbox.port";
import type { IStaffStore, StaffStoreError } from "../../../../shared/ports/staff-store.port";
import { type StaffEnv, staffAccessOf } from "../../../../shared/staff-access";
import {
  type ApprovalActor,
  type ApprovalHandlers,
  type ApprovedActionOf,
  type RequestedAction,
  readApprovedAction,
  sameApprovalParams,
} from "../approved-action";
import { approvalCursorOf, type ListApprovalsInput } from "../dto/list-approvals.dto";
import type { AdminStoreError, IAdminUserStore } from "../ports/admin-user-store.port";
import type {
  ApprovalRecord,
  ApprovalStoreError,
  IApprovalStore,
} from "../ports/approval-store.port";

export interface ApprovalEnv extends StaffEnv {
  ADMIN_APPROVAL_ENABLED: boolean;
  ADMIN_APPROVAL_ACTIONS: readonly ApprovalAction[];
  ADMIN_APPROVAL_TTL_HOURS: number;
}

export type ApprovalRequestError =
  | AppError
  | ApprovalStoreError
  | AdminStoreError
  | AppError<"ADMIN_USER_NOT_FOUND">
  | AppError<"ADMIN_APPROVAL_SELF_SUBJECT_FORBIDDEN">;

export type ApprovalDecisionError =
  | AppError
  | ApprovalStoreError
  | StaffStoreError
  | AppError<"ADMIN_APPROVAL_SUBJECT_DECISION_FORBIDDEN">
  | AppError<"ADMIN_APPROVAL_REQUESTER_LOST_CONFLICT">
  | AppError<"ADMIN_APPROVAL_NOT_FOUND">
  | AppError<"ADMIN_APPROVAL_SELF_DECISION_FORBIDDEN">
  | AppError<"ADMIN_APPROVAL_PERMISSION_FORBIDDEN">
  | AppError<"ADMIN_APPROVAL_DECIDED_CONFLICT">
  | AppError<"ADMIN_APPROVAL_EXPIRED_CONFLICT">
  | AppError<"ADMIN_APPROVAL_PARAMS_INVALID">;

type ApprovalRequest<K extends ApprovalAction> = RequestedAction<K> & {
  requestedBy: string;
  requesterPermissions: readonly StaffPermission[];
};

export interface ApprovalPage {
  items: ApprovalRecord[];
  nextCursor: Option<string>;
}

interface ApprovalDecision {
  approvalId: string;
  deciderUserId: string;
  deciderPermissions: readonly StaffPermission[];
  decision: "approve" | "reject";
  note: string;
}

const notFound: AppError<"ADMIN_APPROVAL_NOT_FOUND"> = {
  code: "ADMIN_APPROVAL_NOT_FOUND",
  message: "This approval request does not exist.",
};

const requesterLost: AppError<"ADMIN_APPROVAL_REQUESTER_LOST_CONFLICT"> = {
  code: "ADMIN_APPROVAL_REQUESTER_LOST_CONFLICT",
  message: "The person who asked no longer holds this power, so the request is closed.",
};

const alreadyDecided: AppError<"ADMIN_APPROVAL_DECIDED_CONFLICT"> = {
  code: "ADMIN_APPROVAL_DECIDED_CONFLICT",
  message: "This request has already been settled.",
};

const expired: AppError<"ADMIN_APPROVAL_EXPIRED_CONFLICT"> = {
  code: "ADMIN_APPROVAL_EXPIRED_CONFLICT",
  message: "This request has expired. Ask again if the action is still needed.",
};

function isOver(record: ApprovalRecord): boolean {
  return record.expiresAt.getTime() <= Date.now();
}

function refOf(record: ApprovalRecord) {
  return {
    approvalId: record.id,
    action: record.action,
    requesterUserId: record.requestedBy,
    userId: record.subjectId,
  };
}

export class ApprovalService {
  constructor(
    private readonly store: IApprovalStore,
    private readonly users: IAdminUserStore,
    private readonly staff: IStaffStore,
    private readonly outbox: IOutboxRepository,
    private readonly uow: IUnitOfWork,
    private readonly instrumentation: IInstrumentation,
    private readonly handlers: ApprovalHandlers,
    private readonly env: ApprovalEnv,
  ) {}

  async gate<K extends ApprovalAction>(
    input: ApprovalRequest<K>,
  ): Promise<Result<Option<string>, ApprovalRequestError>> {
    const listed =
      this.env.ADMIN_APPROVAL_ENABLED && this.env.ADMIN_APPROVAL_ACTIONS.includes(input.action);
    if (!listed) return Result.ok(Option.none());

    const prepared = await this.handlers[input.action].prepare(input, {
      userId: input.requestedBy,
      permissions: input.requesterPermissions,
    });
    if (prepared.isFailure) return Result.fail(prepared.getError());

    if (input.subjectId === input.requestedBy) {
      return Result.fail({
        code: "ADMIN_APPROVAL_SELF_SUBJECT_FORBIDDEN",
        message: "Nobody asks a colleague to act on their own account.",
      });
    }

    const subject = await this.users.findUserById(input.subjectId);
    if (subject.isFailure) return Result.fail(subject.getError());
    if (subject.getValue().isNone()) {
      return Result.fail({ code: "ADMIN_USER_NOT_FOUND", message: "User not found." });
    }

    return this.uow.run(async (): Promise<Result<Option<string>, ApprovalRequestError>> => {
      const overdue = await this.store.expireDueFor(input.action, input.subjectId);
      if (overdue.isFailure) return Result.fail(overdue.getError());

      for (const record of overdue.getValue()) {
        await this.announce(EventTypes.ADMIN_APPROVAL_EXPIRED, record, { actorUserId: null });
      }

      const created = await this.store.create({
        action: input.action,
        subjectId: input.subjectId,
        params: prepared.getValue(),
        requestedBy: input.requestedBy,
        ttlHours: this.env.ADMIN_APPROVAL_TTL_HOURS,
      });
      if (created.isFailure) return Result.fail(created.getError());

      const { record, created: isNew } = created.getValue();
      const sameRequest =
        record.requestedBy === input.requestedBy &&
        sameApprovalParams(record.params, prepared.getValue());
      if (!isNew && !sameRequest) {
        return Result.fail({
          code: "ADMIN_APPROVAL_ALREADY_PENDING_CONFLICT",
          message: "A different request on this person is already waiting for a decision.",
          metadata: { approvalId: record.id },
        });
      }

      if (isNew) {
        await this.announce(EventTypes.ADMIN_APPROVAL_REQUESTED, record, {
          actorUserId: input.requestedBy,
        });
      }

      return Result.ok(Option.some(record.id));
    });
  }

  async list(input: ListApprovalsInput): Promise<Result<ApprovalPage, ApprovalStoreError>> {
    const found = await this.store.list(input);
    if (found.isFailure) return Result.fail(found.getError());

    const items = found.getValue();
    const last = Option.fromNullable(items.at(-1));
    const isFull = items.length === input.limit;

    return Result.ok({
      items,
      nextCursor: last.filter(() => isFull).map(approvalCursorOf),
    });
  }

  async get(id: string): Promise<Result<ApprovalRecord, ApprovalDecisionError>> {
    const found = await this.store.find(id);
    if (found.isFailure) return Result.fail(found.getError());

    return found.getValue().toResult(notFound);
  }

  async decide(input: ApprovalDecision): Promise<Result<void, ApprovalDecisionError>> {
    const loaded = await this.get(input.approvalId);
    if (loaded.isFailure) return Result.fail(loaded.getError());

    const record = loaded.getValue();
    const refused = this.refusal(record, input);
    if (refused.isSome()) return Result.fail(refused.unwrap());

    const actor = { userId: input.deciderUserId, permissions: input.deciderPermissions };
    if (input.decision === "approve") {
      const approved = readApprovedAction(record);
      if (approved.isSuccess) {
        const authorized = await this.authorizeAction(approved.getValue(), actor);
        if (authorized.isFailure) return Result.fail(authorized.getError());
      }
    }

    const holds = await this.requesterHolds(record);
    if (holds.isFailure) return Result.fail(holds.getError());
    if (!holds.getValue()) {
      await this.recordFailure(record, input, requesterLost.code);

      return Result.fail(requesterLost);
    }

    return input.decision === "reject"
      ? this.reject(record, input)
      : this.approve(record, input, actor);
  }

  async cancel(input: {
    approvalId: string;
    userId: string;
  }): Promise<Result<void, ApprovalDecisionError>> {
    const loaded = await this.get(input.approvalId);
    if (loaded.isFailure) return Result.fail(loaded.getError());

    const record = loaded.getValue();
    if (record.requestedBy !== input.userId) return Result.fail(notFound);
    if (record.status !== "pending") return Result.fail(alreadyDecided);

    return this.uow.run(async (): Promise<Result<void, ApprovalDecisionError>> => {
      const cancelled = await this.store.cancel(record.id, input.userId);
      if (cancelled.isFailure) return Result.fail(cancelled.getError());
      if (cancelled.getValue().isNone()) return Result.fail(alreadyDecided);

      await this.announce(EventTypes.ADMIN_APPROVAL_CANCELLED, record, {
        actorUserId: input.userId,
      });

      return Result.ok();
    });
  }

  async expireDue(batchSize: number): Promise<Result<number, ApprovalStoreError>> {
    return this.uow.run(async (): Promise<Result<number, ApprovalStoreError>> => {
      const due = await this.store.expireDue(batchSize);
      if (due.isFailure) return Result.fail(due.getError());

      for (const record of due.getValue()) {
        await this.announce(EventTypes.ADMIN_APPROVAL_EXPIRED, record, { actorUserId: null });
      }

      return Result.ok(due.getValue().length);
    });
  }

  countDue(): Promise<Result<number, ApprovalStoreError>> {
    return this.store.countDue();
  }

  async closeForDeletedUser(userId: string): Promise<Result<void, ApprovalStoreError>> {
    return this.uow.run(async (): Promise<Result<void, ApprovalStoreError>> => {
      const closed = await this.store.closeForDeletedUser(userId);
      if (closed.isFailure) return Result.fail(closed.getError());

      for (const record of closed.getValue()) {
        await this.announce(EventTypes.ADMIN_APPROVAL_CANCELLED, record, { actorUserId: null });
      }

      return Result.ok();
    });
  }

  private refusal(record: ApprovalRecord, input: ApprovalDecision): Option<ApprovalDecisionError> {
    if (record.requestedBy === input.deciderUserId) {
      return Option.some({
        code: "ADMIN_APPROVAL_SELF_DECISION_FORBIDDEN",
        message: "A different person must decide this request.",
      });
    }

    if (record.subjectId === input.deciderUserId) {
      return Option.some({
        code: "ADMIN_APPROVAL_SUBJECT_DECISION_FORBIDDEN",
        message: "Nobody decides a request about their own account.",
      });
    }

    const permission = APPROVAL_ACTION_PERMISSION[record.action];
    if (!input.deciderPermissions.includes(permission)) {
      return Option.some({
        code: "ADMIN_APPROVAL_PERMISSION_FORBIDDEN",
        message: `Deciding this request requires the ${permission} permission.`,
      });
    }

    if (record.status !== "pending") return Option.some(alreadyDecided);
    if (isOver(record)) return Option.some(expired);

    return Option.none();
  }

  private async requesterHolds(record: ApprovalRecord): Promise<Result<boolean, StaffStoreError>> {
    const found = await this.staff.findActive(record.requestedBy);
    if (found.isFailure) return Result.fail(found.getError());

    const unbanned = found.getValue().filter((row) => !row.banned);
    const permission = APPROVAL_ACTION_PERMISSION[record.action];

    return Result.ok(
      staffAccessOf({ id: record.requestedBy }, unbanned, this.env)
        .map((access) => access.permissions.includes(permission))
        .unwrapOr(false),
    );
  }

  private reject(
    record: ApprovalRecord,
    input: ApprovalDecision,
  ): Promise<Result<void, ApprovalDecisionError>> {
    return this.uow.run(async (): Promise<Result<void, ApprovalDecisionError>> => {
      const claimed = await this.claim(record, input, "rejected");
      if (claimed.isFailure) return Result.fail(claimed.getError());

      return Result.ok();
    });
  }

  private async approve(
    record: ApprovalRecord,
    input: ApprovalDecision,
    actor: ApprovalActor,
  ): Promise<Result<void, ApprovalDecisionError>> {
    const progress = { claimed: false };

    const outcome = await this.uow.run(async (): Promise<Result<void, ApprovalDecisionError>> => {
      const claimed = await this.claim(record, input, "approved");
      if (claimed.isFailure) return Result.fail(claimed.getError());
      progress.claimed = true;

      const approved = readApprovedAction(claimed.getValue());
      if (approved.isFailure) return Result.fail(approved.getError());

      const executed = await this.execute(approved.getValue(), actor);
      if (executed.isFailure) return Result.fail(executed.getError());

      const { id, version } = claimed.getValue();
      const marked = await this.store.markExecuted(id, version);
      if (marked.isFailure) return Result.fail(marked.getError());
      if (!marked.getValue()) return Result.fail(alreadyDecided);

      await this.announce(EventTypes.ADMIN_APPROVAL_EXECUTED, record, {
        actorUserId: input.deciderUserId,
      });

      return Result.ok();
    });
    if (outcome.isSuccess || !progress.claimed) return outcome;

    await this.recordFailure(record, input, outcome.getError().code);

    return outcome;
  }

  private authorizeAction<K extends ApprovalAction>(
    approved: ApprovedActionOf<K>,
    actor: ApprovalActor,
  ): Promise<Result<void, AppError>> {
    return this.handlers[approved.action].authorize(approved, actor);
  }

  private execute<K extends ApprovalAction>(
    approved: ApprovedActionOf<K>,
    actor: ApprovalActor,
  ): Promise<Result<void, AppError>> {
    return this.handlers[approved.action].run(approved, actor);
  }

  private async claim(
    record: ApprovalRecord,
    input: ApprovalDecision,
    status: "approved" | "rejected",
  ): Promise<Result<ApprovalRecord, ApprovalDecisionError>> {
    const claimed = await this.store.claim({
      id: record.id,
      status,
      decidedBy: input.deciderUserId,
      note: input.note,
    });
    if (claimed.isFailure) return Result.fail(claimed.getError());
    if (claimed.getValue().isNone()) return Result.fail(alreadyDecided);

    await this.announce(EventTypes.ADMIN_APPROVAL_DECIDED, record, {
      actorUserId: input.deciderUserId,
      outcome: status,
      note: input.note,
    });

    return Result.ok(claimed.getValue().unwrap());
  }

  private async recordFailure(
    record: ApprovalRecord,
    input: ApprovalDecision,
    reason: string,
  ): Promise<void> {
    try {
      const recorded = await this.uow.run(async (): Promise<Result<void, ApprovalStoreError>> => {
        const marked = await this.store.markFailed({
          id: record.id,
          decidedBy: input.deciderUserId,
          note: input.note,
          reason,
        });
        if (marked.isFailure) return Result.fail(marked.getError());
        if (!marked.getValue()) return Result.ok();

        await this.announce(EventTypes.ADMIN_APPROVAL_FAILED, record, {
          actorUserId: input.deciderUserId,
          reason,
        });

        return Result.ok();
      });
      if (recorded.isFailure) this.instrumentation.capture(recorded.getError());
    } catch (err) {
      this.instrumentation.capture(err);
    }
  }

  private async announce(
    type: EventType,
    record: ApprovalRecord,
    extra: Record<string, unknown>,
  ): Promise<void> {
    await emitEvent(this.outbox, type, "admin_approval", record.id, {
      ...refOf(record),
      ...extra,
    });
  }
}
