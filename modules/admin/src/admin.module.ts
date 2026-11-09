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
import type { IAdminOrgStore } from "./application/ports/admin-org-store.port";
import type { IAdminUserStore } from "./application/ports/admin-user-store.port";
import type { IApprovalStore } from "./application/ports/approval-store.port";
import type { IDeadWebhookReader } from "./application/ports/dead-webhook-reader.port";
import type { IEntitlementsReader } from "./application/ports/entitlements-reader.port";
import type { ILocaleReader } from "./application/ports/locale-reader.port";
import type { IOpsStore } from "./application/ports/ops-store.port";
import type { IPlanOverrideStore } from "./application/ports/plan-override.port";
import type { ISavedViewStore } from "./application/ports/saved-view-store.port";
import type { IStaffNoteStore } from "./application/ports/staff-note-store.port";
import type { IStaffStore } from "./application/ports/staff-store.port";
import type { IStepUpStore } from "./application/ports/step-up-store.port";
import type {
  IStripeEventGateway,
  IStripeEventStore,
  StripeReplayRule,
} from "./application/ports/stripe-event.port";
import type { ITotpVerifier } from "./application/ports/totp-verifier.port";
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
import { DrizzleAdminOrgStore } from "./infrastructure/repositories/drizzle-admin-org.store";
import { DrizzleAdminUserStore } from "./infrastructure/repositories/drizzle-admin-user.store";
import { DrizzleApprovalStore } from "./infrastructure/repositories/drizzle-approval.store";
import { DrizzleOpsStore } from "./infrastructure/repositories/drizzle-ops.store";
import { DrizzleSavedViewStore } from "./infrastructure/repositories/drizzle-saved-view.store";
import { DrizzleStaffStore } from "./infrastructure/repositories/drizzle-staff.store";
import { DrizzleStaffNoteStore } from "./infrastructure/repositories/drizzle-staff-note.store";
import { DrizzleStepUpStore } from "./infrastructure/repositories/drizzle-step-up.store";

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
      (c): IAdminUserStore => new DrizzleAdminUserStore(c.IInstrumentation, c.ILogger),
    )
    .add(
      "IAdminOrgStore",
      (c): IAdminOrgStore => new DrizzleAdminOrgStore(c.IInstrumentation, c.ILogger),
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
        new DrizzleStaffStore(c.IInstrumentation, c.ITransactionService, c.ILogger),
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
    .add("IStepUpStore", (c): IStepUpStore => new DrizzleStepUpStore(c.IInstrumentation, c.ILogger))
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
        new DrizzleApprovalStore(c.IInstrumentation, c.ITransactionService, c.ILogger),
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
    .add("IOpsStore", (c): IOpsStore => new DrizzleOpsStore(c.IInstrumentation, c.WebhooksService))
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
    .add("IStaffNoteStore", (c): IStaffNoteStore => new DrizzleStaffNoteStore(c.IInstrumentation))
    .add(
      "StaffNoteService",
      (c) => new StaffNoteService(c.IStaffNoteStore, c.IOutboxRepository, c.ITransactionService),
    )
    .add("ISavedViewStore", (c): ISavedViewStore => new DrizzleSavedViewStore(c.IInstrumentation))
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
