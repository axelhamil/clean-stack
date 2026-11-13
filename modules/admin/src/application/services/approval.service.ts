import type { ApprovalAction, StaffPermission } from "@packages/access-control";
import { type AppError, EventCollector, type IUnitOfWork, Option, Result } from "@packages/ddd-kit";
import {
  type ApprovalHandlers,
  type RequestedAction,
  sameApprovalParams,
} from "../approved-action";
import type { AdminSettings } from "../config/admin-settings";
import { approvalRequestOf, pendingRequestsOf } from "../mappers/approval-request.mapper";
import type { AdminStoreError, IAdminUserStore } from "../ports/repositories/admin-user-store.port";
import type { ApprovalStoreError, IApprovalStore } from "../ports/repositories/approval-store.port";

export type ApprovalSettings = Pick<
  AdminSettings,
  "approvalEnabled" | "approvalActions" | "approvalTtlHours"
>;

export type ApprovalRequestError =
  | AppError
  | ApprovalStoreError
  | AdminStoreError
  | AppError<"ADMIN_USER_NOT_FOUND">
  | AppError<"ADMIN_APPROVAL_SELF_SUBJECT_FORBIDDEN">;

type ApprovalRequestInput<K extends ApprovalAction> = RequestedAction<K> & {
  requestedBy: string;
  requesterPermissions: readonly StaffPermission[];
};

export class ApprovalService {
  constructor(
    private readonly store: IApprovalStore,
    private readonly users: IAdminUserStore,
    private readonly uow: IUnitOfWork,
    private readonly handlers: ApprovalHandlers,
    private readonly settings: ApprovalSettings,
  ) {}

  async gate<K extends ApprovalAction>(
    input: ApprovalRequestInput<K>,
  ): Promise<Result<Option<string>, ApprovalRequestError>> {
    const listed =
      this.settings.approvalEnabled && this.settings.approvalActions.includes(input.action);
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

      const overdueRequests = pendingRequestsOf(overdue.getValue());
      if (overdueRequests.isFailure) return Result.fail(overdueRequests.getError());

      const now = new Date();
      const expired = overdueRequests.getValue();
      const settled = Result.combine(expired.map((request) => request.expire(now)));
      if (settled.isFailure) return Result.fail(settled.getError());

      EventCollector.collectFrom(expired);

      const created = await this.store.create({
        action: input.action,
        subjectId: input.subjectId,
        params: prepared.getValue(),
        requestedBy: input.requestedBy,
        ttlHours: this.settings.approvalTtlHours,
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
        const request = approvalRequestOf(record);
        if (request.isFailure) return Result.fail(request.getError());

        request.getValue().request(new Date());
        EventCollector.collectFrom(request.getValue());
      }

      return Result.ok(Option.some(record.id));
    });
  }
}
