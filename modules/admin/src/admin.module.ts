import {
  type IInstrumentation,
  type ILogger,
  type IUnitOfWork,
  Option,
  Result,
} from "@packages/ddd-kit";
import type { IEmailService } from "@packages/email/email.port";
import type { ISweepRunStore } from "@packages/http/sweep-run.port";
import type { IOutboxRepository } from "@packages/outbox/outbox.port";
import { defineModule } from "inwire";
import type { ApprovalHandlers } from "./application/approved-action";
import type { AdminSettings } from "./application/config/admin-settings";
import { closeApprovalsOfDeletedUser } from "./application/event-handlers/close-approvals-of-deleted-user";
import { notifyImpersonatedUser } from "./application/event-handlers/notify-impersonated-user";
import type { IAdminOrgStore } from "./application/ports/repositories/admin-org-store.port";
import type { IAdminUserStore } from "./application/ports/repositories/admin-user-store.port";
import type { IApprovalStore } from "./application/ports/repositories/approval-store.port";
import type { IOpsStore } from "./application/ports/repositories/ops-store.port";
import type { IPlanOverrideStore } from "./application/ports/repositories/plan-override.port";
import type { ISavedViewStore } from "./application/ports/repositories/saved-view-store.port";
import type { IStaffNoteStore } from "./application/ports/repositories/staff-note-store.port";
import type { IStaffStore } from "./application/ports/repositories/staff-store.port";
import type { IStepUpStore } from "./application/ports/repositories/step-up-store.port";
import type {
  IStripeEventStore,
  StripeReplayRule,
} from "./application/ports/repositories/stripe-event.port";
import type { IDeadWebhookReader } from "./application/ports/services/dead-webhook-reader.port";
import type { IEntitlementsReader } from "./application/ports/services/entitlements-reader.port";
import type { ILocaleReader } from "./application/ports/services/locale-reader.port";
import type { IStripeEventGateway } from "./application/ports/services/stripe-event-gateway.port";
import type { ITotpVerifier } from "./application/ports/services/totp-verifier.port";
import { AdminModerationService } from "./application/services/admin-moderation.service";
import { AdminQueryService } from "./application/services/admin-query.service";
import { ApprovalService } from "./application/services/approval.service";
import { InboxService } from "./application/services/inbox.service";
import { OpsService } from "./application/services/ops.service";
import { PlanOverrideService } from "./application/services/plan-override.service";
import { SavedViewService } from "./application/services/saved-view.service";
import { StaffService } from "./application/services/staff.service";
import type { StaffEnv } from "./application/services/staff-access";
import {
  StaffAccessService,
  type StaffLookupOnce,
} from "./application/services/staff-access.service";
import { StaffNoteService } from "./application/services/staff-note.service";
import { StepUpService } from "./application/services/step-up.service";
import { StripeReplayService } from "./application/services/stripe-replay.service";
import { DrizzleAdminOrgRepository } from "./infra/repos/drizzle/admin-org.repository";
import { DrizzleAdminUserRepository } from "./infra/repos/drizzle/admin-user.repository";
import { DrizzleApprovalRepository } from "./infra/repos/drizzle/approval.repository";
import { DrizzleOpsRepository } from "./infra/repos/drizzle/ops.repository";
import { DrizzleSavedViewRepository } from "./infra/repos/drizzle/saved-view.repository";
import { DrizzleStaffRepository } from "./infra/repos/drizzle/staff.repository";
import { DrizzleStaffNoteRepository } from "./infra/repos/drizzle/staff-note.repository";
import { DrizzleStepUpRepository } from "./infra/repos/drizzle/step-up.repository";

export interface AdminPrerequisites {
  IInstrumentation: IInstrumentation;
  ILogger: ILogger;
  ITransactionService: IUnitOfWork;
  IOutboxRepository: IOutboxRepository;
  IEmailService: IEmailService;
  ITotpVerifier: ITotpVerifier;
  ISweepRunStore: ISweepRunStore;
  ILocaleReader: ILocaleReader;
  WebhooksService: IDeadWebhookReader;
  EntitlementsService: IEntitlementsReader;
  IPlanOverrideStore: IPlanOverrideStore;
  IStripeEventStore: IStripeEventStore;
  IStripeEventGateway: IStripeEventGateway;
  isReplayableStripeEvent: StripeReplayRule;
  staffLookupOnce: StaffLookupOnce;
  staffSettings: StaffEnv;
  adminSettings: AdminSettings;
}

export const adminModule = defineModule<AdminPrerequisites>()((b) =>
  b
    .add(
      "IAdminUserStore",
      (c): IAdminUserStore => new DrizzleAdminUserRepository(c.IInstrumentation, c.ILogger),
    )
    .add(
      "IAdminOrgStore",
      (c): IAdminOrgStore => new DrizzleAdminOrgRepository(c.IInstrumentation, c.ILogger),
    )
    .add(
      "AdminQueryService",
      (c) =>
        new AdminQueryService(
          c.IAdminUserStore,
          c.IInstrumentation,
          c.IAdminOrgStore,
          c.EntitlementsService,
          c.IPlanOverrideStore,
        ),
    )
    .add(
      "IStaffStore",
      (c): IStaffStore =>
        new DrizzleStaffRepository(c.IInstrumentation, c.ITransactionService, c.ILogger),
    )
    .add(
      "StaffAccessService",
      (c) =>
        new StaffAccessService(
          c.IStaffStore,
          c.IOutboxRepository,
          c.ITransactionService,
          c.staffSettings,
          c.staffLookupOnce,
        ),
    )
    .add(
      "StaffService",
      (c) =>
        new StaffService(
          c.IStaffStore,
          c.IAdminUserStore,
          c.IOutboxRepository,
          c.ITransactionService,
          c.staffSettings,
        ),
    )
    .add(
      "AdminModerationService",
      (c) =>
        new AdminModerationService(c.IAdminUserStore, c.IOutboxRepository, c.ITransactionService),
    )
    .add(
      "IStepUpStore",
      (c): IStepUpStore => new DrizzleStepUpRepository(c.IInstrumentation, c.ILogger),
    )
    .add(
      "StepUpService",
      (c) =>
        new StepUpService(
          c.IStepUpStore,
          c.ITotpVerifier,
          c.IOutboxRepository,
          c.ITransactionService,
          { ADMIN_STEP_UP_TTL_SECONDS: c.adminSettings.stepUpTtlSeconds },
          c.ILogger,
        ),
    )
    .add(
      "IApprovalStore",
      (c): IApprovalStore =>
        new DrizzleApprovalRepository(c.IInstrumentation, c.ITransactionService, c.ILogger),
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
          c.staffSettings,
          c.adminSettings,
        ),
    )
    .add(
      "IOpsStore",
      (c): IOpsStore => new DrizzleOpsRepository(c.IInstrumentation, c.WebhooksService),
    )
    .add(
      "OpsService",
      (c) =>
        new OpsService(c.IOpsStore, c.ISweepRunStore, c.IOutboxRepository, c.ITransactionService, {
          OUTBOX_LEASE_SECONDS: c.adminSettings.outboxLeaseSeconds,
        }),
    )
    .add(
      "StripeReplayService",
      (c) =>
        new StripeReplayService(
          c.IStripeEventStore,
          c.IStripeEventGateway,
          c.IOutboxRepository,
          c.ITransactionService,
          c.isReplayableStripeEvent,
        ),
    )
    .add(
      "PlanOverrideService",
      (c) =>
        new PlanOverrideService(
          c.IPlanOverrideStore,
          c.IAdminOrgStore,
          c.IOutboxRepository,
          c.ITransactionService,
        ),
    )
    .add(
      "IStaffNoteStore",
      (c): IStaffNoteStore => new DrizzleStaffNoteRepository(c.IInstrumentation),
    )
    .add(
      "StaffNoteService",
      (c) => new StaffNoteService(c.IStaffNoteStore, c.IOutboxRepository, c.ITransactionService),
    )
    .add(
      "ISavedViewStore",
      (c): ISavedViewStore => new DrizzleSavedViewRepository(c.IInstrumentation),
    )
    .add(
      "SavedViewService",
      (c) => new SavedViewService(c.ISavedViewStore, c.IOutboxRepository, c.ITransactionService),
    )
    .add("InboxService", (c) => new InboxService(c.IApprovalStore, c.IOpsStore, c.ISweepRunStore))
    .add("CloseApprovalsOfDeletedUser", (c) =>
      closeApprovalsOfDeletedUser({ ApprovalService: c.ApprovalService }),
    )
    .add("NotifyImpersonatedUser", (c) =>
      notifyImpersonatedUser({
        IEmailService: c.IEmailService,
        AdminQueryService: c.AdminQueryService,
        ILocaleReader: c.ILocaleReader,
        supportUrl: c.adminSettings.supportUrl,
      }),
    ),
);
