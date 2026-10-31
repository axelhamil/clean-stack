import { type EventHandler, Option, Result } from "@packages/ddd-kit";
import { defineModule } from "inwire";
import { env } from "../../shared/env";
import type { IStaffStore } from "../../shared/ports/staff-store.port";
import { StaffAccessService } from "../../shared/services/staff-access.service";
import type { ApprovalHandlers } from "./application/approved-action";
import { closeApprovalsOfDeletedUser } from "./application/event-handlers/close-approvals-of-deleted-user";
import { notifyImpersonatedUser } from "./application/event-handlers/notify-impersonated-user";
import type { IAdminOrgStore } from "./application/ports/admin-org-store.port";
import type { IAdminUserStore } from "./application/ports/admin-user-store.port";
import type { IApprovalStore } from "./application/ports/approval-store.port";
import type { IStepUpStore } from "./application/ports/step-up-store.port";
import { AdminModerationService } from "./application/services/admin-moderation.service";
import { AdminQueryService } from "./application/services/admin-query.service";
import { ApprovalService } from "./application/services/approval.service";
import { StaffService } from "./application/services/staff.service";
import { StepUpService } from "./application/services/step-up.service";
import { DrizzleAdminOrgStore } from "./infrastructure/repositories/drizzle-admin-org.store";
import { DrizzleAdminUserStore } from "./infrastructure/repositories/drizzle-admin-user.store";
import { DrizzleApprovalStore } from "./infrastructure/repositories/drizzle-approval.store";
import { DrizzleStaffStore } from "./infrastructure/repositories/drizzle-staff.store";
import { DrizzleStepUpStore } from "./infrastructure/repositories/drizzle-step-up.store";

declare module "inwire" {
  interface AppDeps {
    IAdminUserStore: IAdminUserStore;
    IAdminOrgStore: IAdminOrgStore;
    AdminQueryService: AdminQueryService;
    IStaffStore: IStaffStore;
    StaffAccessService: StaffAccessService;
    StaffService: StaffService;
    AdminModerationService: AdminModerationService;
    IStepUpStore: IStepUpStore;
    StepUpService: StepUpService;
    IApprovalStore: IApprovalStore;
    ApprovalHandlers: ApprovalHandlers;
    ApprovalService: ApprovalService;
    CloseApprovalsOfDeletedUser: EventHandler;
    NotifyImpersonatedUser: EventHandler;
  }
}

export const adminModule = defineModule()((b) =>
  b
    .add("IAdminUserStore", (c): IAdminUserStore => new DrizzleAdminUserStore(c.IInstrumentation))
    .add("IAdminOrgStore", (c): IAdminOrgStore => new DrizzleAdminOrgStore(c.IInstrumentation))
    .add(
      "AdminQueryService",
      (c) => new AdminQueryService(c.IAdminUserStore, c.IInstrumentation, c.IAdminOrgStore),
    )
    .add("IStaffStore", (c): IStaffStore => new DrizzleStaffStore(c.IInstrumentation))
    .add(
      "StaffAccessService",
      (c) => new StaffAccessService(c.IStaffStore, c.IOutboxRepository, c.ITransactionService, env),
    )
    .add(
      "StaffService",
      (c) =>
        new StaffService(
          c.IStaffStore,
          c.IAdminUserStore,
          c.IOutboxRepository,
          c.ITransactionService,
          env,
        ),
    )
    .add(
      "AdminModerationService",
      (c) =>
        new AdminModerationService(c.IAdminUserStore, c.IOutboxRepository, c.ITransactionService),
    )
    .add("IStepUpStore", (c): IStepUpStore => new DrizzleStepUpStore(c.IInstrumentation))
    .add(
      "StepUpService",
      (c) =>
        new StepUpService(
          c.IStepUpStore,
          c.ITotpVerifier,
          c.IOutboxRepository,
          c.ITransactionService,
          env,
        ),
    )
    .add(
      "IApprovalStore",
      (c): IApprovalStore => new DrizzleApprovalStore(c.IInstrumentation, c.ITransactionService),
    )
    .add(
      "ApprovalHandlers",
      (c): ApprovalHandlers => ({
        "user.ban_permanent": {
          prepare: async ({ subjectId, params }, actor) => {
            const refused = await c.StaffService.refuseBan({
              actorPermissions: actor.permissions,
              targetUserId: subjectId,
            });

            return refused.isFailure ? Result.fail(refused.getError()) : Result.ok(params);
          },
          authorize: async ({ subjectId }, actor) =>
            c.StaffService.refuseTarget({
              actorPermissions: actor.permissions,
              targetUserId: subjectId,
            }),
          run: ({ subjectId, params }, actor) =>
            c.StaffService.moderateBan(
              { actorPermissions: actor.permissions, targetUserId: subjectId },
              () =>
                c.AdminModerationService.ban({
                  actorUserId: actor.userId,
                  userId: subjectId,
                  reason: params.reason,
                  expiresIn: params.expiresIn,
                }),
            ),
        },
        "staff.role_change": {
          prepare: async ({ subjectId, params }, actor) => {
            const from = await c.StaffService.refuseRoleChange({
              actorUserId: actor.userId,
              actorPermissions: actor.permissions,
              targetUserId: subjectId,
              role: params.role,
            });

            return from.isFailure
              ? Result.fail(from.getError())
              : Result.ok({ role: params.role, fromRole: from.getValue().toNull() });
          },
          authorize: async ({ subjectId, params }, actor) =>
            c.StaffService.refusedRoleGrant({
              actorUserId: actor.userId,
              actorPermissions: actor.permissions,
              targetUserId: subjectId,
              role: params.role,
            }),
          run: ({ subjectId, params }, actor) =>
            c.StaffService.assignRole({
              actorUserId: actor.userId,
              actorPermissions: actor.permissions,
              targetUserId: subjectId,
              role: params.role,
              expectedRole: params.fromRole,
            }),
        },
        "staff.revoke": {
          prepare: async ({ subjectId, params }, actor) => {
            const refused = await c.StaffService.refuseRevoke({
              actorUserId: actor.userId,
              targetUserId: subjectId,
            });

            return refused.isFailure ? Result.fail(refused.getError()) : Result.ok(params);
          },
          authorize: async () => Result.ok(),
          run: ({ subjectId }, actor) =>
            c.StaffService.revoke({ actorUserId: actor.userId, targetUserId: subjectId }),
        },
        "staff.permission_override": {
          prepare: async ({ subjectId, params }, actor) => {
            const change = {
              actorUserId: actor.userId,
              actorPermissions: actor.permissions,
              targetUserId: subjectId,
            };

            if (params.op === "set") {
              const expiresAt = params.expiresAt ?? null;
              const refused = await c.StaffService.refuseOverride({
                ...change,
                permission: params.permission,
                effect: params.effect,
                expiresAt: Option.fromNullable(expiresAt).map((iso) => new Date(iso)),
              });

              return refused.isFailure
                ? Result.fail(refused.getError())
                : Result.ok({
                    op: "set" as const,
                    permission: params.permission,
                    effect: params.effect,
                    expiresAt,
                  });
            }

            const live = await c.StaffService.refuseOverrideRemoval({
              ...change,
              overrideId: params.overrideId,
            });
            if (live.isFailure) return Result.fail(live.getError());

            const row = live.getValue();

            return Result.ok({
              op: "revoke" as const,
              overrideId: params.overrideId,
              permission: row.permission,
              effect: row.effect,
              expiresAt: row.expiresAt.map((at) => at.toISOString()).toNull(),
            });
          },
          authorize: async ({ params }, actor) =>
            c.StaffService.refusedOverrideGrant({
              actorPermissions: actor.permissions,
              permission: params.permission,
              effect: params.effect,
              liftsOverride: params.op === "revoke",
            }),
          run: ({ subjectId, params }, actor) => {
            const change = {
              actorUserId: actor.userId,
              actorPermissions: actor.permissions,
              targetUserId: subjectId,
            };

            return params.op === "set"
              ? c.StaffService.setOverride({
                  ...change,
                  permission: params.permission,
                  effect: params.effect,
                  expiresAt: Option.fromNullable(params.expiresAt).map((iso) => new Date(iso)),
                })
              : c.StaffService.removeOverride({ ...change, overrideId: params.overrideId });
          },
        },
      }),
    )
    .add(
      "ApprovalService",
      (c) =>
        new ApprovalService(
          c.IApprovalStore,
          c.IAdminUserStore,
          c.IStaffStore,
          c.IOutboxRepository,
          c.ITransactionService,
          c.IInstrumentation,
          c.ApprovalHandlers,
          env,
        ),
    )
    .add("CloseApprovalsOfDeletedUser", (c) =>
      closeApprovalsOfDeletedUser({ ApprovalService: c.ApprovalService }),
    )
    .add("NotifyImpersonatedUser", (c) =>
      notifyImpersonatedUser({
        IEmailService: c.IEmailService,
        AdminQueryService: c.AdminQueryService,
        IProfileStore: c.IProfileStore,
        supportUrl: `${env.APP_URL}/support`,
      }),
    ),
);
