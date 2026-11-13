import type { IInstrumentation, ILogger, IUnitOfWork } from "@packages/ddd-kit";
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
import type { ICountDueApprovalsQuery } from "./application/queries/count-due-approvals.query";
import type { ICountExpiredImpersonationsQuery } from "./application/queries/count-expired-impersonations.query";
import type { IGetApprovalQuery } from "./application/queries/get-approval.query";
import type { IGetOrgQuery } from "./application/queries/get-org.query";
import type { IGetUserQuery } from "./application/queries/get-user.query";
import type { IListApprovalsQuery } from "./application/queries/list-approvals.query";
import type { IListDeadLettersQuery } from "./application/queries/list-dead-letters.query";
import type { IListOrgsQuery } from "./application/queries/list-orgs.query";
import type { IListSavedViewsQuery } from "./application/queries/list-saved-views.query";
import type { IListStaffQuery } from "./application/queries/list-staff.query";
import type { IListStaffNotesQuery } from "./application/queries/list-staff-notes.query";
import type { IListStaffOverridesQuery } from "./application/queries/list-staff-overrides.query";
import type { IListStripeEventsQuery } from "./application/queries/list-stripe-events.query";
import type { IListSweepRunsQuery } from "./application/queries/list-sweep-runs.query";
import type { IListUsersQuery } from "./application/queries/list-users.query";
import type { IStaffInboxQuery } from "./application/queries/staff-inbox.query";
import type { IStepUpValidityQuery } from "./application/queries/step-up-validity.query";
import { AdminModerationService } from "./application/services/admin-moderation.service";
import { AdminQueryService } from "./application/services/admin-query.service";
import { ApprovalService } from "./application/services/approval.service";
import { BanPermanentApprovalHandler } from "./application/services/approval-handlers/ban-permanent.handler";
import { PermissionOverrideApprovalHandler } from "./application/services/approval-handlers/permission-override.handler";
import { RoleChangeApprovalHandler } from "./application/services/approval-handlers/role-change.handler";
import { StaffRevokeApprovalHandler } from "./application/services/approval-handlers/staff-revoke.handler";
import { PlanOverrideService } from "./application/services/plan-override.service";
import { StaffService } from "./application/services/staff.service";
import {
  StaffAccessService,
  type StaffLookupOnce,
} from "./application/services/staff-access.service";
import { StepUpService } from "./application/services/step-up.service";
import { AddStaffNoteUseCase } from "./application/usecases/add-staff-note/add-staff-note.usecase";
import { BanUserUseCase } from "./application/usecases/ban-user/ban-user.usecase";
import { CancelApprovalUseCase } from "./application/usecases/cancel-approval/cancel-approval.usecase";
import { ChangeStaffRoleUseCase } from "./application/usecases/change-staff-role/change-staff-role.usecase";
import { CloseApprovalsOfDeletedUserUseCase } from "./application/usecases/close-approvals-of-deleted-user/close-approvals-of-deleted-user.usecase";
import { DecideApprovalUseCase } from "./application/usecases/decide-approval/decide-approval.usecase";
import { DeleteViewUseCase } from "./application/usecases/delete-view/delete-view.usecase";
import { ExpireApprovalsUseCase } from "./application/usecases/expire-approvals/expire-approvals.usecase";
import { ExpireImpersonationsUseCase } from "./application/usecases/expire-impersonations/expire-impersonations.usecase";
import { NotifyImpersonatedUserUseCase } from "./application/usecases/notify-impersonated-user/notify-impersonated-user.usecase";
import { RemoveStaffOverrideUseCase } from "./application/usecases/remove-staff-override/remove-staff-override.usecase";
import { ReplayStripeEventUseCase } from "./application/usecases/replay-stripe-event/replay-stripe-event.usecase";
import { RequeueOutboxUseCase } from "./application/usecases/requeue-outbox/requeue-outbox.usecase";
import { ResetUserPasswordUseCase } from "./application/usecases/reset-user-password/reset-user-password.usecase";
import { RevokePlanOverrideUseCase } from "./application/usecases/revoke-plan-override/revoke-plan-override.usecase";
import { RevokeStaffUseCase } from "./application/usecases/revoke-staff/revoke-staff.usecase";
import { RevokeUserSessionsUseCase } from "./application/usecases/revoke-user-sessions/revoke-user-sessions.usecase";
import { SaveViewUseCase } from "./application/usecases/save-view/save-view.usecase";
import { SetPlanOverrideUseCase } from "./application/usecases/set-plan-override/set-plan-override.usecase";
import { SetStaffOverrideUseCase } from "./application/usecases/set-staff-override/set-staff-override.usecase";
import { StartImpersonationUseCase } from "./application/usecases/start-impersonation/start-impersonation.usecase";
import { UnbanUserUseCase } from "./application/usecases/unban-user/unban-user.usecase";
import { VerifyStepUpUseCase } from "./application/usecases/verify-step-up/verify-step-up.usecase";
import type { StaffEnv } from "./domain/staff/services/staff-access.service";
import { DueApprovalCountQuery } from "./infra/queries/count-due-approvals.query";
import { ExpiredImpersonationCountQuery } from "./infra/queries/count-expired-impersonations.query";
import { ApprovalDetailQuery } from "./infra/queries/get-approval.query";
import { AdminOrgDetailQuery } from "./infra/queries/get-org.query";
import { AdminUserDetailQuery } from "./infra/queries/get-user.query";
import { ApprovalListQuery } from "./infra/queries/list-approvals.query";
import { DeadLettersQuery } from "./infra/queries/list-dead-letters.query";
import { AdminOrgListQuery } from "./infra/queries/list-orgs.query";
import { SavedViewListQuery } from "./infra/queries/list-saved-views.query";
import { StaffListQuery } from "./infra/queries/list-staff.query";
import { StaffNoteListQuery } from "./infra/queries/list-staff-notes.query";
import { StaffOverrideListQuery } from "./infra/queries/list-staff-overrides.query";
import { StripeEventListQuery } from "./infra/queries/list-stripe-events.query";
import { SweepRunsQuery } from "./infra/queries/list-sweep-runs.query";
import { AdminUserListQuery } from "./infra/queries/list-users.query";
import { StaffInboxQuery } from "./infra/queries/staff-inbox.query";
import { StepUpValidityQuery } from "./infra/queries/step-up-validity.query";
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
  IEntitlementsReader: IEntitlementsReader;
  IPlanOverrideStore: IPlanOverrideStore;
  IStripeEventStore: IStripeEventStore;
  IStripeEventGateway: IStripeEventGateway<(request: Request) => Promise<Response>>;
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
      "IListUsersQuery",
      (c): IListUsersQuery => new AdminUserListQuery(c.IAdminUserStore, c.IInstrumentation),
    )
    .add(
      "IListOrgsQuery",
      (c): IListOrgsQuery => new AdminOrgListQuery(c.IAdminOrgStore, c.IInstrumentation),
    )
    .add(
      "IGetUserQuery",
      (c): IGetUserQuery => new AdminUserDetailQuery(c.IAdminUserStore, c.IInstrumentation),
    )
    .add(
      "IGetOrgQuery",
      (c): IGetOrgQuery =>
        new AdminOrgDetailQuery(
          c.IAdminOrgStore,
          c.IEntitlementsReader,
          c.IPlanOverrideStore,
          c.IInstrumentation,
        ),
    )
    .add("AdminQueryService", (c) => new AdminQueryService(c.IListUsersQuery, c.IListOrgsQuery))
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
      "IStepUpValidityQuery",
      (c): IStepUpValidityQuery =>
        new StepUpValidityQuery(
          c.IStepUpStore,
          { ADMIN_STEP_UP_TTL_SECONDS: c.adminSettings.stepUpTtlSeconds },
          c.IInstrumentation,
        ),
    )
    .add(
      "VerifyStepUpUseCase",
      (c) =>
        new VerifyStepUpUseCase(
          c.IStepUpStore,
          c.ITotpVerifier,
          c.IOutboxRepository,
          c.ITransactionService,
          { ADMIN_STEP_UP_TTL_SECONDS: c.adminSettings.stepUpTtlSeconds },
          c.ILogger,
        ),
    )
    .add("StepUpService", (c) => new StepUpService(c.IStepUpValidityQuery))
    .add(
      "IApprovalStore",
      (c): IApprovalStore =>
        new DrizzleApprovalRepository(c.IInstrumentation, c.ITransactionService, c.ILogger),
    )
    .add(
      "ApprovalHandlers",
      (c): ApprovalHandlers => ({
        "user.ban_permanent": new BanPermanentApprovalHandler(
          c.StaffService,
          c.AdminModerationService,
        ),
        "staff.role_change": new RoleChangeApprovalHandler(c.StaffService),
        "staff.revoke": new StaffRevokeApprovalHandler(c.StaffService),
        "staff.permission_override": new PermissionOverrideApprovalHandler(c.StaffService),
      }),
    )
    .add(
      "ApprovalService",
      (c) =>
        new ApprovalService(
          c.IApprovalStore,
          c.IAdminUserStore,
          c.ITransactionService,
          c.ApprovalHandlers,
          c.adminSettings,
        ),
    )
    .add(
      "IListApprovalsQuery",
      (c): IListApprovalsQuery => new ApprovalListQuery(c.IApprovalStore, c.IInstrumentation),
    )
    .add(
      "IGetApprovalQuery",
      (c): IGetApprovalQuery => new ApprovalDetailQuery(c.IApprovalStore, c.IInstrumentation),
    )
    .add(
      "ICountDueApprovalsQuery",
      (c): ICountDueApprovalsQuery =>
        new DueApprovalCountQuery(c.IApprovalStore, c.IInstrumentation),
    )
    .add(
      "DecideApprovalUseCase",
      (c) =>
        new DecideApprovalUseCase(
          c.IApprovalStore,
          c.IStaffStore,
          c.ITransactionService,
          c.IInstrumentation,
          c.ApprovalHandlers,
          c.staffSettings,
        ),
    )
    .add(
      "CancelApprovalUseCase",
      (c) => new CancelApprovalUseCase(c.IApprovalStore, c.ITransactionService),
    )
    .add(
      "ExpireApprovalsUseCase",
      (c) => new ExpireApprovalsUseCase(c.IApprovalStore, c.ITransactionService),
    )
    .add(
      "CloseApprovalsOfDeletedUserUseCase",
      (c) => new CloseApprovalsOfDeletedUserUseCase(c.IApprovalStore, c.ITransactionService),
    )
    .add(
      "IListStaffQuery",
      (c): IListStaffQuery =>
        new StaffListQuery(c.IStaffStore, c.staffSettings, c.IInstrumentation),
    )
    .add(
      "IListStaffOverridesQuery",
      (c): IListStaffOverridesQuery =>
        new StaffOverrideListQuery(c.IStaffStore, c.staffSettings, c.IInstrumentation),
    )
    .add(
      "ICountExpiredImpersonationsQuery",
      (c): ICountExpiredImpersonationsQuery =>
        new ExpiredImpersonationCountQuery(c.IStaffStore, c.IInstrumentation),
    )
    .add(
      "ExpireImpersonationsUseCase",
      (c) =>
        new ExpireImpersonationsUseCase(c.IStaffStore, c.IOutboxRepository, c.ITransactionService),
    )
    .add(
      "BanUserUseCase",
      (c) => new BanUserUseCase(c.StaffService, c.ApprovalService, c.AdminModerationService),
    )
    .add("UnbanUserUseCase", (c) => new UnbanUserUseCase(c.StaffService, c.AdminModerationService))
    .add(
      "RevokeUserSessionsUseCase",
      (c) => new RevokeUserSessionsUseCase(c.StaffService, c.AdminModerationService),
    )
    .add(
      "ResetUserPasswordUseCase",
      (c) => new ResetUserPasswordUseCase(c.StaffService, c.AdminModerationService),
    )
    .add(
      "StartImpersonationUseCase",
      (c) => new StartImpersonationUseCase(c.AdminModerationService),
    )
    .add(
      "ChangeStaffRoleUseCase",
      (c) => new ChangeStaffRoleUseCase(c.ApprovalService, c.StaffService),
    )
    .add("RevokeStaffUseCase", (c) => new RevokeStaffUseCase(c.ApprovalService, c.StaffService))
    .add(
      "SetStaffOverrideUseCase",
      (c) => new SetStaffOverrideUseCase(c.ApprovalService, c.StaffService),
    )
    .add(
      "RemoveStaffOverrideUseCase",
      (c) => new RemoveStaffOverrideUseCase(c.ApprovalService, c.StaffService),
    )
    .add(
      "IOpsStore",
      (c): IOpsStore => new DrizzleOpsRepository(c.IInstrumentation, c.WebhooksService),
    )
    .add(
      "IListDeadLettersQuery",
      (c): IListDeadLettersQuery => new DeadLettersQuery(c.IOpsStore, c.IInstrumentation),
    )
    .add(
      "IListSweepRunsQuery",
      (c): IListSweepRunsQuery => new SweepRunsQuery(c.ISweepRunStore, c.IInstrumentation),
    )
    .add(
      "RequeueOutboxUseCase",
      (c) =>
        new RequeueOutboxUseCase(c.IOutboxRepository, c.ITransactionService, {
          OUTBOX_LEASE_SECONDS: c.adminSettings.outboxLeaseSeconds,
        }),
    )
    .add(
      "IListStripeEventsQuery",
      (c): IListStripeEventsQuery =>
        new StripeEventListQuery(c.IStripeEventStore, c.IStripeEventGateway, c.IInstrumentation),
    )
    .add(
      "ReplayStripeEventUseCase",
      (c) =>
        new ReplayStripeEventUseCase(
          c.IStripeEventStore,
          c.IStripeEventGateway,
          c.IOutboxRepository,
          c.ITransactionService,
          c.isReplayableStripeEvent,
        ),
    )
    .add(
      "SetPlanOverrideUseCase",
      (c) =>
        new SetPlanOverrideUseCase(
          c.IPlanOverrideStore,
          c.IAdminOrgStore,
          c.IOutboxRepository,
          c.ITransactionService,
        ),
    )
    .add(
      "RevokePlanOverrideUseCase",
      (c) =>
        new RevokePlanOverrideUseCase(
          c.IPlanOverrideStore,
          c.IOutboxRepository,
          c.ITransactionService,
        ),
    )
    .add("PlanOverrideService", (c) => new PlanOverrideService(c.SetPlanOverrideUseCase))
    .add(
      "IStaffNoteStore",
      (c): IStaffNoteStore => new DrizzleStaffNoteRepository(c.IInstrumentation),
    )
    .add(
      "IListStaffNotesQuery",
      (c): IListStaffNotesQuery => new StaffNoteListQuery(c.IStaffNoteStore, c.IInstrumentation),
    )
    .add(
      "AddStaffNoteUseCase",
      (c) => new AddStaffNoteUseCase(c.IStaffNoteStore, c.IOutboxRepository, c.ITransactionService),
    )
    .add(
      "ISavedViewStore",
      (c): ISavedViewStore => new DrizzleSavedViewRepository(c.IInstrumentation),
    )
    .add(
      "IListSavedViewsQuery",
      (c): IListSavedViewsQuery => new SavedViewListQuery(c.ISavedViewStore, c.IInstrumentation),
    )
    .add(
      "SaveViewUseCase",
      (c) => new SaveViewUseCase(c.ISavedViewStore, c.IOutboxRepository, c.ITransactionService),
    )
    .add(
      "DeleteViewUseCase",
      (c) => new DeleteViewUseCase(c.ISavedViewStore, c.IOutboxRepository, c.ITransactionService),
    )
    .add(
      "IStaffInboxQuery",
      (c): IStaffInboxQuery =>
        new StaffInboxQuery(c.IApprovalStore, c.IOpsStore, c.ISweepRunStore, c.IInstrumentation),
    )
    .add("CloseApprovalsOfDeletedUser", (c) =>
      closeApprovalsOfDeletedUser({
        CloseApprovalsOfDeletedUserUseCase: c.CloseApprovalsOfDeletedUserUseCase,
      }),
    )
    .add(
      "NotifyImpersonatedUserUseCase",
      (c) =>
        new NotifyImpersonatedUserUseCase(
          c.IGetUserQuery,
          c.IEmailService,
          c.ILocaleReader,
          c.adminSettings.supportUrl,
        ),
    )
    .add("NotifyImpersonatedUser", (c) =>
      notifyImpersonatedUser({ NotifyImpersonatedUserUseCase: c.NotifyImpersonatedUserUseCase }),
    ),
);
