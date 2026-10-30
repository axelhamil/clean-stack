import type { StaffAccess } from "@packages/access-control";
import { type IUnitOfWork, Option, Result } from "@packages/ddd-kit";
import { EventTypes } from "@packages/events";
import { emitEvent } from "../event-emitter";
import type { IOutboxRepository } from "../ports/outbox.port";
import type { IStaffStore, StaffStoreError } from "../ports/staff-store.port";
import { staffLookupOnce } from "../request-context";
import {
  IMPERSONATE_PERMISSION,
  type StaffEnv,
  type StaffUser,
  staffAccessOf,
} from "../staff-access";

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

    const found = await this.lookup(user.id);
    if (found.isFailure) return Result.fail(found.getError());

    return Result.ok(staffAccessOf(user, found.getValue(), this.env));
  }

  async gate(user: StaffUser, session: StaffSessionRef): Promise<AccessResult> {
    const access = await this.read(user, session);
    if (access.isFailure || session.impersonatedBy || !this.isListed(user.id)) return access;

    const found = await this.lookup(user.id);
    if (found.isFailure) return Result.fail(found.getError());
    if (found.getValue().isSome()) return access;

    const bootstrapped = await this.bootstrap(user.id);
    if (bootstrapped.isFailure) return Result.fail(bootstrapped.getError());

    return access;
  }

  async impersonatorHolds(impersonatorId: string): Promise<boolean> {
    if (this.isListed(impersonatorId)) return true;

    const found = await this.lookup(impersonatorId);
    if (found.isFailure) return false;

    return staffAccessOf({ id: impersonatorId }, found.getValue(), this.env)
      .map((access) => access.permissions.includes(IMPERSONATE_PERMISSION))
      .unwrapOr(false);
  }

  private isListed(userId: string): boolean {
    return this.env.PLATFORM_ADMIN_IDS.includes(userId);
  }

  private lookup(userId: string) {
    return staffLookupOnce(userId, () => this.store.findActive(userId));
  }

  private async bootstrap(userId: string): Promise<Result<void, StaffStoreError>> {
    return this.uow.run(async () => {
      const written = await this.store.bootstrapFromEnv(userId);
      if (written.isFailure) return Result.fail(written.getError());
      if (!written.getValue()) return Result.ok();

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
