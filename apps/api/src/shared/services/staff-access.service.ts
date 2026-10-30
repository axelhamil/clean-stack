import { type IUnitOfWork, Option, Result } from "@packages/ddd-kit";
import { EventTypes } from "@packages/events";
import { emitEvent } from "../event-emitter";
import type { IOutboxRepository } from "../ports/outbox.port";
import type { IStaffStore, StaffStoreError } from "../ports/staff-store.port";
import { type StaffAccess, type StaffEnv, type StaffUser, staffAccessOf } from "../staff-access";

export interface StaffSessionRef {
  impersonatedBy?: string | null;
}

type AccessResult = Result<Option<StaffAccess>, StaffStoreError>;

export class StaffAccessService {
  constructor(
    private readonly store: IStaffStore,
    private readonly outbox: IOutboxRepository,
    private readonly uow: IUnitOfWork,
    private readonly env: StaffEnv,
  ) {}

  async read(user: StaffUser, session: StaffSessionRef): Promise<AccessResult> {
    if (session.impersonatedBy) return Result.ok(Option.none());

    const found = await this.store.findActive(user.id);
    if (found.isFailure) return Result.fail(found.getError());

    return Result.ok(staffAccessOf(user, found.getValue(), this.env));
  }

  async gate(user: StaffUser, session: StaffSessionRef): Promise<AccessResult> {
    if (session.impersonatedBy) return Result.ok(Option.none());

    const found = await this.store.findActive(user.id);
    if (found.isFailure) return Result.fail(found.getError());

    if (found.getValue().isNone() && this.env.PLATFORM_ADMIN_IDS.includes(user.id)) {
      const bootstrapped = await this.bootstrap(user.id);
      if (bootstrapped.isFailure) return Result.fail(bootstrapped.getError());
    }

    return Result.ok(staffAccessOf(user, found.getValue(), this.env));
  }

  private async bootstrap(userId: string): Promise<Result<void, StaffStoreError>> {
    return this.uow.run(async () => {
      const inserted = await this.store.insertFromEnv(userId);
      if (inserted.isFailure) return Result.fail(inserted.getError());
      if (!inserted.getValue()) return Result.ok();

      await emitEvent(this.outbox, EventTypes.ADMIN_STAFF_ADDED, "user", userId, {
        actorUserId: null,
        userId,
        role: "manager",
        source: "env",
      });

      return Result.ok();
    });
  }
}
