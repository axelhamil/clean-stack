import type { StaffPermission, StaffRole } from "@packages/access-control";
import { type AppError, type IUnitOfWork, type Option, Result } from "@packages/ddd-kit";
import { EventTypes } from "@packages/events";
import { emitEvent } from "../../../../shared/event-emitter";
import type { IOutboxRepository } from "../../../../shared/ports/outbox.port";
import type {
  IStaffStore,
  StaffListRow,
  StaffRecord,
  StaffStoreError,
} from "../../../../shared/ports/staff-store.port";
import {
  grantsStaffAccess,
  IMPERSONATE_PERMISSION,
  isLastManager,
  permissionsOfRecord,
  type StaffListing,
} from "../../../../shared/staff-access";
import type { AdminStoreError, IAdminUserStore } from "../ports/admin-user-store.port";

export type StaffChangeError =
  | StaffStoreError
  | AdminStoreError
  | AppError<"ADMIN_STAFF_SELF_CHANGE_FORBIDDEN">
  | AppError<"ADMIN_STAFF_LISTED_FORBIDDEN">
  | AppError<"ADMIN_STAFF_LAST_MANAGER_FORBIDDEN">
  | AppError<"ADMIN_STAFF_NOT_FOUND">
  | AppError<"ADMIN_USER_NOT_FOUND">;

export type StaffModerationError = StaffStoreError | AppError<"ADMIN_USER_STAFF_TARGET_FORBIDDEN">;

export type StaffBanError = StaffModerationError | AppError<"ADMIN_STAFF_LAST_MANAGER_FORBIDDEN">;

interface StaffModeration {
  actorPermissions: readonly StaffPermission[];
  targetUserId: string;
}

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
    private readonly env: StaffListing,
  ) {}

  async list(): Promise<Result<StaffListRow[], StaffStoreError>> {
    const rows = await this.store.listActive();
    if (rows.isFailure) return rows;

    return Result.ok(rows.getValue().filter((row) => grantsStaffAccess(row, this.env)));
  }

  async moderate<E>(
    input: StaffModeration,
    action: () => Promise<Result<void, E>>,
  ): Promise<Result<void, StaffModerationError | E>> {
    const refused = await this.refusedTarget(input);
    if (refused.isFailure) return Result.fail(refused.getError());

    return action();
  }

  async moderateBan<E>(
    input: StaffModeration,
    ban: () => Promise<Result<void, E>>,
  ): Promise<Result<void, StaffBanError | E>> {
    return this.uow.run(async (): Promise<Result<void, StaffBanError | E>> => {
      const managers = await this.store.lockActiveManagers();
      if (managers.isFailure) return Result.fail(managers.getError());

      const target = await this.grantingRow(input.targetUserId);
      if (target.isFailure) return Result.fail(target.getError());

      const refused = this.refusedOn(input, target.getValue());
      if (refused.isFailure) return Result.fail(refused.getError());

      const isManager =
        this.isListed(input.targetUserId) ||
        target
          .getValue()
          .filter((row) => row.role === "manager")
          .isSome();
      if (isManager && isLastManager(input.targetUserId, managers.getValue(), this.env)) {
        return Result.fail(lastManager());
      }

      return ban();
    });
  }

  async assignRole(
    input: StaffChange & { role: StaffRole },
  ): Promise<Result<void, StaffChangeError>> {
    const refused = this.refusedChange(input);
    if (refused.isFailure) return refused;

    return this.uow.run(async (): Promise<Result<void, StaffChangeError>> => {
      const managers = await this.store.lockActiveManagers();
      if (managers.isFailure) return Result.fail(managers.getError());

      const found = await this.grantingRow(input.targetUserId);
      if (found.isFailure) return Result.fail(found.getError());

      if (found.getValue().isNone()) return this.add(input);

      const row = found.getValue().unwrap();
      const from = row.role;
      if (from === input.role) return Result.ok();

      if (from === "manager" && isLastManager(input.targetUserId, managers.getValue(), this.env)) {
        return Result.fail(lastManager());
      }

      const assigned = await this.store.assign({
        userId: input.targetUserId,
        role: input.role,
        createdBy: input.actorUserId,
      });
      if (assigned.isFailure) return Result.fail(assigned.getError());

      const stillImpersonates = permissionsOfRecord(
        { ...row, role: input.role },
        new Date(),
      ).includes(IMPERSONATE_PERMISSION);
      if (!stillImpersonates) {
        const ended = await this.store.endImpersonationsBy(input.targetUserId);
        if (ended.isFailure) return Result.fail(ended.getError());
      }

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

      const found = await this.grantingRow(input.targetUserId);
      if (found.isFailure) return Result.fail(found.getError());

      if (found.getValue().isNone()) {
        return Result.fail({ code: "ADMIN_STAFF_NOT_FOUND", message: "Not a staff member." });
      }

      const { role } = found.getValue().unwrap();
      if (role === "manager" && isLastManager(input.targetUserId, managers.getValue(), this.env)) {
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

    if (this.isListed(input.targetUserId)) {
      return Result.fail({
        code: "ADMIN_STAFF_LISTED_FORBIDDEN",
        message: "This access comes from PLATFORM_ADMIN_IDS and changes there.",
      });
    }

    return Result.ok();
  }

  private isListed(userId: string): boolean {
    return this.env.PLATFORM_ADMIN_IDS.includes(userId);
  }

  private async grantingRow(userId: string): Promise<Result<Option<StaffRecord>, StaffStoreError>> {
    const found = await this.store.findActive(userId);
    if (found.isFailure) return Result.fail(found.getError());

    return Result.ok(found.getValue().filter((row) => grantsStaffAccess(row, this.env)));
  }

  private async refusedTarget(input: StaffModeration): Promise<Result<void, StaffModerationError>> {
    const target = await this.grantingRow(input.targetUserId);
    if (target.isFailure) return Result.fail(target.getError());

    return this.refusedOn(input, target.getValue());
  }

  private refusedOn(
    input: StaffModeration,
    target: Option<StaffRecord>,
  ): Result<void, StaffModerationError> {
    const targetIsStaff = this.isListed(input.targetUserId) || target.isSome();
    if (targetIsStaff && !input.actorPermissions.includes("staff.manage")) {
      return Result.fail({
        code: "ADMIN_USER_STAFF_TARGET_FORBIDDEN",
        message: "Only someone who manages the staff can act on a staff member.",
      });
    }

    return Result.ok();
  }
}

function lastManager(): AppError<"ADMIN_STAFF_LAST_MANAGER_FORBIDDEN"> {
  return {
    code: "ADMIN_STAFF_LAST_MANAGER_FORBIDDEN",
    message: "The last manager cannot lose access.",
  };
}
