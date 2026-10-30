import { permissionsOfRole, type StaffPermission, type StaffRole } from "@packages/access-control";
import { type AppError, type IUnitOfWork, type Option, Result } from "@packages/ddd-kit";
import { EventTypes } from "@packages/events";
import { emitEvent } from "../../../../shared/event-emitter";
import type { IOutboxRepository } from "../../../../shared/ports/outbox.port";
import type {
  IStaffStore,
  StaffListRow,
  StaffOverrideRow,
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

const MANAGE_STAFF_PERMISSION: StaffPermission = "staff.manage";

export type StaffChangeError =
  | StaffStoreError
  | AdminStoreError
  | AppError<"ADMIN_STAFF_SELF_CHANGE_FORBIDDEN">
  | AppError<"ADMIN_STAFF_LISTED_FORBIDDEN">
  | AppError<"ADMIN_STAFF_LAST_MANAGER_FORBIDDEN">
  | AppError<"ADMIN_STAFF_NOT_FOUND">
  | AppError<"ADMIN_STAFF_OVERRIDE_NOT_FOUND">
  | AppError<"ADMIN_STAFF_OVERRIDE_EXPIRED_CONFLICT">
  | AppError<"ADMIN_STAFF_GRANT_NOT_HELD_FORBIDDEN">
  | AppError<"ADMIN_STAFF_ROLE_CHANGED_CONFLICT">
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

interface StaffGrantingChange extends StaffChange {
  actorPermissions: readonly StaffPermission[];
}

interface StaffOverrideChange extends StaffGrantingChange {
  permission: StaffPermission;
  effect: "grant" | "deny";
  expiresAt: Option<Date>;
}

interface StaffOverrideRemoval extends StaffGrantingChange {
  overrideId: string;
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

  async listOverrides(targetUserId: string): Promise<Result<StaffOverrideRow[], StaffChangeError>> {
    const row = await this.grantingRow(targetUserId);
    if (row.isFailure) return Result.fail(row.getError());
    if (row.getValue().isNone()) return Result.fail(notStaff());

    return this.store.listLiveOverrides(targetUserId);
  }

  async moderate<E>(
    input: StaffModeration,
    action: () => Promise<Result<void, E>>,
  ): Promise<Result<void, StaffModerationError | E>> {
    const refused = await this.refuseTarget(input);
    if (refused.isFailure) return Result.fail(refused.getError());

    return action();
  }

  async moderateBan<E>(
    input: StaffModeration,
    ban: () => Promise<Result<void, E>>,
  ): Promise<Result<void, StaffBanError | E>> {
    return this.uow.run(async (): Promise<Result<void, StaffBanError | E>> => {
      const refused = await this.banRefusal(input);
      if (refused.isFailure) return Result.fail(refused.getError());

      return ban();
    });
  }

  refuseBan(input: StaffModeration): Promise<Result<void, StaffBanError>> {
    return this.uow.run(() => this.banRefusal(input));
  }

  async banIsSensitive(input: {
    targetUserId: string;
    expiresIn?: number;
  }): Promise<Result<boolean, StaffStoreError | AdminStoreError>> {
    if (input.expiresIn === undefined || this.isListed(input.targetUserId)) return Result.ok(true);

    const staff = await this.grantingRow(input.targetUserId);
    if (staff.isFailure) return Result.fail(staff.getError());
    if (staff.getValue().isSome()) return Result.ok(true);

    const found = await this.users.findUserById(input.targetUserId);
    if (found.isFailure) return Result.fail(found.getError());

    return Result.ok(
      found
        .getValue()
        .map((user) => user.banned && user.banExpires.isNone())
        .unwrapOr(false),
    );
  }

  async refuseRoleChange(
    input: StaffGrantingChange & { role: StaffRole },
  ): Promise<Result<Option<StaffRole>, StaffChangeError>> {
    const refused = this.refusedRoleGrant(input);
    if (refused.isFailure) return Result.fail(refused.getError());

    return this.uow.run(async (): Promise<Result<Option<StaffRole>, StaffChangeError>> => {
      const managers = await this.store.lockActiveManagers();
      if (managers.isFailure) return Result.fail(managers.getError());

      const found = await this.grantingRow(input.targetUserId);
      if (found.isFailure) return Result.fail(found.getError());

      const from = found.getValue().map((row) => row.role);
      const demotesManager = from.filter((role) => role === "manager").isSome();
      if (
        demotesManager &&
        input.role !== "manager" &&
        isLastManager(input.targetUserId, managers.getValue(), this.env)
      ) {
        return Result.fail(lastManager());
      }

      return Result.ok(from);
    });
  }

  async refuseRevoke(input: StaffChange): Promise<Result<void, StaffChangeError>> {
    const refused = this.refusedChange(input);
    if (refused.isFailure) return refused;

    return this.uow.run(async (): Promise<Result<void, StaffChangeError>> => {
      const role = await this.revocableRole(input);
      if (role.isFailure) return Result.fail(role.getError());

      return Result.ok();
    });
  }

  async assignRole(
    input: StaffGrantingChange & { role: StaffRole; expectedRole?: StaffRole | null },
  ): Promise<Result<void, StaffChangeError>> {
    const refused = this.refusedRoleGrant(input);
    if (refused.isFailure) return refused;

    return this.uow.run(async (): Promise<Result<void, StaffChangeError>> => {
      const managers = await this.store.lockActiveManagers();
      if (managers.isFailure) return Result.fail(managers.getError());

      const found = await this.grantingRow(input.targetUserId);
      if (found.isFailure) return Result.fail(found.getError());

      const current = found
        .getValue()
        .map((row) => row.role)
        .toNull();
      if (input.expectedRole !== undefined && input.expectedRole !== current) {
        return Result.fail({
          code: "ADMIN_STAFF_ROLE_CHANGED_CONFLICT",
          message: "This person's access changed since the request was made. Ask again.",
        });
      }

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
      const revocable = await this.revocableRole(input);
      if (revocable.isFailure) return Result.fail(revocable.getError());

      const role = revocable.getValue();
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

  refuseOverride(input: StaffOverrideChange): Promise<Result<void, StaffChangeError>> {
    return this.uow.run(async (): Promise<Result<void, StaffChangeError>> => {
      const refused = await this.overrideRefusal(input);

      return refused.isFailure ? Result.fail(refused.getError()) : Result.ok();
    });
  }

  async refuseOverrideRemoval(
    input: StaffOverrideRemoval,
  ): Promise<Result<StaffOverrideRow, StaffChangeError>> {
    const refused = this.refusedChange(input);
    if (refused.isFailure) return Result.fail(refused.getError());

    const live = await this.listOverrides(input.targetUserId);
    if (live.isFailure) return Result.fail(live.getError());

    const row = live.getValue().find((candidate) => candidate.id === input.overrideId);
    if (!row) return Result.fail(overrideNotFound());

    const lifted = this.refusedRemoval(input, row);
    if (lifted.isFailure) return Result.fail(lifted.getError());

    return Result.ok(row);
  }

  async setOverride(input: StaffOverrideChange): Promise<Result<void, StaffChangeError>> {
    return this.uow.run(async (): Promise<Result<void, StaffChangeError>> => {
      const refused = await this.overrideRefusal(input);
      if (refused.isFailure) return Result.fail(refused.getError());

      const written = await this.store.replaceOverride({
        userId: input.targetUserId,
        permission: input.permission,
        effect: input.effect,
        expiresAt: input.expiresAt,
        createdBy: input.actorUserId,
      });
      if (written.isFailure) return Result.fail(written.getError());

      const ended = await this.endImpersonationsIfLost(input.targetUserId);
      if (ended.isFailure) return ended;

      await emitEvent(
        this.outbox,
        EventTypes.ADMIN_STAFF_OVERRIDE_SET,
        "user",
        input.targetUserId,
        {
          actorUserId: input.actorUserId,
          userId: input.targetUserId,
          overrideId: written.getValue(),
          permission: input.permission,
          effect: input.effect,
          expiresAt: input.expiresAt.map((date) => date.toISOString()).toNull(),
        },
      );

      return Result.ok();
    });
  }

  async removeOverride(input: StaffOverrideRemoval): Promise<Result<void, StaffChangeError>> {
    const refused = this.refusedChange(input);
    if (refused.isFailure) return refused;

    return this.uow.run(async (): Promise<Result<void, StaffChangeError>> => {
      const managers = await this.store.lockActiveManagers();
      if (managers.isFailure) return Result.fail(managers.getError());

      const removed = await this.store.revokeOverride(input.targetUserId, input.overrideId);
      if (removed.isFailure) return Result.fail(removed.getError());

      const record = removed.getValue();
      if (record.isNone()) return Result.fail(overrideNotFound());

      const lifted = this.refusedRemoval(input, record.unwrap());
      if (lifted.isFailure) return lifted;

      const ended = await this.endImpersonationsIfLost(input.targetUserId);
      if (ended.isFailure) return ended;

      const { permission, effect } = record.unwrap();
      await emitEvent(
        this.outbox,
        EventTypes.ADMIN_STAFF_OVERRIDE_REVOKED,
        "user",
        input.targetUserId,
        {
          actorUserId: input.actorUserId,
          userId: input.targetUserId,
          overrideId: input.overrideId,
          permission,
          effect,
        },
      );

      return Result.ok();
    });
  }

  private async overrideRefusal(
    input: StaffOverrideChange,
  ): Promise<Result<void, StaffChangeError>> {
    const refused = this.refusedChange(input);
    if (refused.isFailure) return refused;

    if (input.effect === "grant" && !input.actorPermissions.includes(input.permission)) {
      return Result.fail(grantNotHeld());
    }

    const isOver = input.expiresAt.map((at) => at.getTime() <= Date.now()).unwrapOr(false);
    if (isOver) {
      return Result.fail({
        code: "ADMIN_STAFF_OVERRIDE_EXPIRED_CONFLICT",
        message: "The end date of this change has passed. Ask again with a later date.",
      });
    }

    const managers = await this.store.lockActiveManagers();
    if (managers.isFailure) return Result.fail(managers.getError());

    const found = await this.grantingRow(input.targetUserId);
    if (found.isFailure) return Result.fail(found.getError());
    if (found.getValue().isNone()) return Result.fail(notStaff());

    const row = found.getValue().unwrap();
    const losesManagement =
      input.effect === "deny" &&
      input.permission === MANAGE_STAFF_PERMISSION &&
      row.role === "manager" &&
      permissionsOfRecord(row, new Date()).includes(MANAGE_STAFF_PERMISSION);
    if (losesManagement && isLastManager(input.targetUserId, managers.getValue(), this.env)) {
      return Result.fail(lastManager());
    }

    return Result.ok();
  }

  private async endImpersonationsIfLost(userId: string): Promise<Result<void, StaffChangeError>> {
    const row = await this.grantingRow(userId);
    if (row.isFailure) return Result.fail(row.getError());

    const stillImpersonates = row
      .getValue()
      .map((record) => permissionsOfRecord(record, new Date()).includes(IMPERSONATE_PERMISSION))
      .unwrapOr(false);
    if (stillImpersonates) return Result.ok();

    const ended = await this.store.endImpersonationsBy(userId);

    return ended.isFailure ? Result.fail(ended.getError()) : Result.ok();
  }

  private async banRefusal(input: StaffModeration): Promise<Result<void, StaffBanError>> {
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

    return Result.ok();
  }

  private async revocableRole(input: StaffChange): Promise<Result<StaffRole, StaffChangeError>> {
    const managers = await this.store.lockActiveManagers();
    if (managers.isFailure) return Result.fail(managers.getError());

    const found = await this.grantingRow(input.targetUserId);
    if (found.isFailure) return Result.fail(found.getError());

    if (found.getValue().isNone()) {
      return Result.fail(notStaff());
    }

    const { role } = found.getValue().unwrap();
    if (role === "manager" && isLastManager(input.targetUserId, managers.getValue(), this.env)) {
      return Result.fail(lastManager());
    }

    return Result.ok(role);
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

  refusedRoleGrant(
    input: StaffGrantingChange & { role: StaffRole },
  ): Result<void, StaffChangeError> {
    const refused = this.refusedChange(input);
    if (refused.isFailure) return refused;

    const beyond = permissionsOfRole(input.role).some(
      (permission) => !input.actorPermissions.includes(permission),
    );

    return beyond ? Result.fail(grantNotHeld()) : Result.ok();
  }

  refusedOverrideGrant(input: {
    actorPermissions: readonly StaffPermission[];
    permission: StaffPermission;
    effect: "grant" | "deny";
    liftsOverride: boolean;
  }): Result<void, StaffChangeError> {
    const gives = input.liftsOverride ? input.effect === "deny" : input.effect === "grant";

    return gives && !input.actorPermissions.includes(input.permission)
      ? Result.fail(grantNotHeld())
      : Result.ok();
  }

  private refusedRemoval(
    input: StaffOverrideRemoval,
    row: { permission: StaffPermission; effect: "grant" | "deny" },
  ): Result<void, StaffChangeError> {
    return this.refusedOverrideGrant({
      actorPermissions: input.actorPermissions,
      permission: row.permission,
      effect: row.effect,
      liftsOverride: true,
    });
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

  async refuseTarget(input: StaffModeration): Promise<Result<void, StaffModerationError>> {
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

function notStaff(): AppError<"ADMIN_STAFF_NOT_FOUND"> {
  return { code: "ADMIN_STAFF_NOT_FOUND", message: "Not a staff member." };
}

function grantNotHeld(): AppError<"ADMIN_STAFF_GRANT_NOT_HELD_FORBIDDEN"> {
  return {
    code: "ADMIN_STAFF_GRANT_NOT_HELD_FORBIDDEN",
    message: "Nobody gives a permission they do not hold themselves.",
  };
}

function overrideNotFound(): AppError<"ADMIN_STAFF_OVERRIDE_NOT_FOUND"> {
  return {
    code: "ADMIN_STAFF_OVERRIDE_NOT_FOUND",
    message: "This permission change no longer exists.",
  };
}

function lastManager(): AppError<"ADMIN_STAFF_LAST_MANAGER_FORBIDDEN"> {
  return {
    code: "ADMIN_STAFF_LAST_MANAGER_FORBIDDEN",
    message: "The last manager cannot lose access.",
  };
}
