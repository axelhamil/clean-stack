import type { StaffRole } from "@packages/access-control";
import { type AppError, type IUnitOfWork, Result } from "@packages/ddd-kit";
import { EventTypes } from "@packages/events";
import { emitEvent } from "../../../../shared/event-emitter";
import type { IOutboxRepository } from "../../../../shared/ports/outbox.port";
import type {
  IStaffStore,
  StaffListRow,
  StaffManagerRecord,
  StaffStoreError,
} from "../../../../shared/ports/staff-store.port";
import type { AdminStoreError, IAdminUserStore } from "../ports/admin-user-store.port";

export type StaffChangeError =
  | StaffStoreError
  | AdminStoreError
  | AppError<"ADMIN_STAFF_SELF_CHANGE_FORBIDDEN">
  | AppError<"ADMIN_STAFF_LISTED_FORBIDDEN">
  | AppError<"ADMIN_STAFF_LAST_MANAGER_FORBIDDEN">
  | AppError<"ADMIN_STAFF_NOT_FOUND">
  | AppError<"ADMIN_USER_NOT_FOUND">;

interface StaffChange {
  actorUserId: string;
  targetUserId: string;
}

export class StaffService {
  constructor(
    private readonly store: IStaffStore,
    private readonly users: IAdminUserStore,
    private readonly outbox: IOutboxRepository,
    private readonly uow: IUnitOfWork,
    private readonly listedIds: readonly string[],
  ) {}

  async list(): Promise<Result<StaffListRow[], StaffStoreError>> {
    const rows = await this.store.listActive();
    if (rows.isFailure) return rows;

    return Result.ok(rows.getValue().filter((row) => this.grantsAccess(row)));
  }

  async isManaged(userId: string): Promise<Result<boolean, StaffStoreError>> {
    if (this.listedIds.includes(userId)) return Result.ok(true);

    const found = await this.store.findActive(userId);
    if (found.isFailure) return Result.fail(found.getError());

    return Result.ok(found.getValue().isSome());
  }

  async assignRole(
    input: StaffChange & { role: StaffRole },
  ): Promise<Result<void, StaffChangeError>> {
    const refused = this.refusedChange(input);
    if (refused.isFailure) return refused;

    return this.uow.run(async (): Promise<Result<void, StaffChangeError>> => {
      const managers = await this.store.lockActiveManagers();
      if (managers.isFailure) return Result.fail(managers.getError());

      const found = await this.store.findActive(input.targetUserId);
      if (found.isFailure) return Result.fail(found.getError());

      if (found.getValue().isNone()) return this.add(input);

      const from = found.getValue().unwrap().role;
      if (from === input.role) return Result.ok();

      if (from === "manager" && this.isLastManager(input.targetUserId, managers.getValue())) {
        return Result.fail(lastManager());
      }

      const assigned = await this.store.assign({
        userId: input.targetUserId,
        role: input.role,
        createdBy: input.actorUserId,
      });
      if (assigned.isFailure) return Result.fail(assigned.getError());

      await emitEvent(
        this.outbox,
        EventTypes.ADMIN_STAFF_ROLE_CHANGED,
        "user",
        input.targetUserId,
        {
          actorUserId: input.actorUserId,
          userId: input.targetUserId,
          from,
          to: input.role,
        },
      );

      return Result.ok();
    });
  }

  async revoke(input: StaffChange): Promise<Result<void, StaffChangeError>> {
    const refused = this.refusedChange(input);
    if (refused.isFailure) return refused;

    return this.uow.run(async (): Promise<Result<void, StaffChangeError>> => {
      const managers = await this.store.lockActiveManagers();
      if (managers.isFailure) return Result.fail(managers.getError());

      const found = await this.store.findActive(input.targetUserId);
      if (found.isFailure) return Result.fail(found.getError());

      if (found.getValue().isNone()) {
        return Result.fail({ code: "ADMIN_STAFF_NOT_FOUND", message: "Not a staff member." });
      }

      const { role } = found.getValue().unwrap();
      if (role === "manager" && this.isLastManager(input.targetUserId, managers.getValue())) {
        return Result.fail(lastManager());
      }

      const revoked = await this.store.revoke(input.targetUserId);
      if (revoked.isFailure) return Result.fail(revoked.getError());

      await emitEvent(this.outbox, EventTypes.ADMIN_STAFF_REVOKED, "user", input.targetUserId, {
        actorUserId: input.actorUserId,
        userId: input.targetUserId,
        role,
      });

      return Result.ok();
    });
  }

  private async add(
    input: StaffChange & { role: StaffRole },
  ): Promise<Result<void, StaffChangeError>> {
    const user = await this.users.findUserById(input.targetUserId);
    if (user.isFailure) return Result.fail(user.getError());

    if (user.getValue().isNone()) {
      return Result.fail({ code: "ADMIN_USER_NOT_FOUND", message: "User not found." });
    }

    const assigned = await this.store.assign({
      userId: input.targetUserId,
      role: input.role,
      createdBy: input.actorUserId,
    });
    if (assigned.isFailure) return Result.fail(assigned.getError());

    await emitEvent(this.outbox, EventTypes.ADMIN_STAFF_ADDED, "user", input.targetUserId, {
      actorUserId: input.actorUserId,
      userId: input.targetUserId,
      role: input.role,
      source: "console",
    });

    return Result.ok();
  }

  private refusedChange(input: StaffChange): Result<void, StaffChangeError> {
    if (input.actorUserId === input.targetUserId) {
      return Result.fail({
        code: "ADMIN_STAFF_SELF_CHANGE_FORBIDDEN",
        message: "Nobody changes their own access.",
      });
    }

    if (this.listedIds.includes(input.targetUserId)) {
      return Result.fail({
        code: "ADMIN_STAFF_LISTED_FORBIDDEN",
        message: "This access comes from PLATFORM_ADMIN_IDS and changes there.",
      });
    }

    return Result.ok();
  }

  private grantsAccess(row: { userId: string; source: string }): boolean {
    return row.source !== "env" || this.listedIds.includes(row.userId);
  }

  private isLastManager(targetUserId: string, managers: readonly StaffManagerRecord[]): boolean {
    return !managers.some((m) => m.userId !== targetUserId && this.grantsAccess(m));
  }
}

function lastManager(): AppError<"ADMIN_STAFF_LAST_MANAGER_FORBIDDEN"> {
  return {
    code: "ADMIN_STAFF_LAST_MANAGER_FORBIDDEN",
    message: "The last manager cannot lose access.",
  };
}
