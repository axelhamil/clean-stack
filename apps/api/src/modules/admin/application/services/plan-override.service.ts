import { type AppError, type IUnitOfWork, Result, uuidv7 } from "@packages/ddd-kit";
import { EventTypes } from "@packages/events";
import { emitEvent } from "../../../../shared/event-emitter";
import type { IOutboxRepository } from "../../../../shared/ports/outbox.port";
import type {
  IPlanOverrideStore,
  PlanOverrideStoreError,
} from "../../../../shared/ports/plan-override.port";
import type { IAdminOrgStore } from "../ports/admin-org-store.port";
import type { AdminStoreError } from "../ports/admin-user-store.port";

export type SetPlanOverrideError =
  | PlanOverrideStoreError
  | AdminStoreError
  | AppError<"ADMIN_ORG_NOT_FOUND">
  | AppError<"ADMIN_PLAN_OVERRIDE_ALREADY_SET_CONFLICT">;

export type RevokePlanOverrideError =
  | PlanOverrideStoreError
  | AppError<"ADMIN_PLAN_OVERRIDE_NOT_FOUND">;

export class PlanOverrideService {
  constructor(
    private readonly overrides: IPlanOverrideStore,
    private readonly orgs: IAdminOrgStore,
    private readonly outbox: IOutboxRepository,
    private readonly uow: IUnitOfWork,
  ) {}

  async set(input: {
    actorUserId: string;
    organizationId: string;
    tier: string;
    expiresAt: Date;
    note: string;
  }): Promise<Result<void, SetPlanOverrideError>> {
    const { actorUserId, organizationId, tier, expiresAt, note } = input;

    const org = await this.orgs.findOrgById(organizationId);
    if (org.isFailure) return Result.fail(org.getError());
    if (org.getValue().isNone()) {
      return Result.fail({
        code: "ADMIN_ORG_NOT_FOUND",
        message: "This organization no longer exists.",
      });
    }

    return this.uow.run(async (): Promise<Result<void, SetPlanOverrideError>> => {
      const closed = await this.overrides.closeOpen(organizationId);
      if (closed.isFailure) return Result.fail(closed.getError());

      const overrideId = uuidv7();
      const written = await this.overrides.insert({
        id: overrideId,
        organizationId,
        tier,
        expiresAt,
        note,
        createdBy: actorUserId,
      });
      if (written.isFailure) return Result.fail(written.getError());
      if (!written.getValue()) {
        return Result.fail({
          code: "ADMIN_PLAN_OVERRIDE_ALREADY_SET_CONFLICT",
          message: "A colleague just set a plan override on this organization.",
        });
      }

      await emitEvent(
        this.outbox,
        EventTypes.ADMIN_PLAN_OVERRIDE_SET,
        "plan_override",
        overrideId,
        {
          actorUserId,
          overrideId,
          organizationId,
          tier,
          expiresAt: expiresAt.toISOString(),
          replacedOverrideId: closed.getValue().toNull(),
        },
      );

      return Result.ok();
    });
  }

  async revoke(input: {
    actorUserId: string;
    organizationId: string;
  }): Promise<Result<void, RevokePlanOverrideError>> {
    const { actorUserId, organizationId } = input;

    return this.uow.run(async (): Promise<Result<void, RevokePlanOverrideError>> => {
      const revoked = await this.overrides.revokeActive(organizationId);
      if (revoked.isFailure) return Result.fail(revoked.getError());

      const row = revoked.getValue();
      if (row.isNone()) {
        return Result.fail({
          code: "ADMIN_PLAN_OVERRIDE_NOT_FOUND",
          message: "This organization has no active plan override.",
        });
      }

      const { id, tier } = row.unwrap();
      await emitEvent(this.outbox, EventTypes.ADMIN_PLAN_OVERRIDE_REVOKED, "plan_override", id, {
        actorUserId,
        overrideId: id,
        organizationId,
        tier,
      });

      return Result.ok();
    });
  }
}
