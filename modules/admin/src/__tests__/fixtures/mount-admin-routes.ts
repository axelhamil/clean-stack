import type { RouteGuards } from "@packages/http/route-guards";
import { mockPort } from "@packages/test/bun";
import { Hono } from "hono";
import {
  type AdminUserRoutesDeps,
  createAdminUserRoutes,
} from "../../infra/http/routes/admin/admin";
import {
  type AdminImpersonationRoutesDeps,
  createAdminImpersonationRoutes,
} from "../../infra/http/routes/admin-impersonation/admin-impersonation";
import {
  type AdminOrgRoutesDeps,
  createAdminOrgRoutes,
} from "../../infra/http/routes/admin-orgs/admin-orgs";
import {
  type AdminApprovalRoutesDeps,
  createAdminApprovalRoutes,
} from "../../infra/http/routes/approvals/approvals";
import { type AdminOpsRoutesDeps, createAdminOpsRoutes } from "../../infra/http/routes/ops/ops";
import {
  type AdminStaffRoutesDeps,
  createAdminStaffRoutes,
} from "../../infra/http/routes/staff/staff";
import {
  type AdminWorkspaceRoutesDeps,
  createAdminWorkspaceRoutes,
} from "../../infra/http/routes/workspace/workspace";

export type AdminRoutesDeps = Omit<
  AdminUserRoutesDeps &
    AdminStaffRoutesDeps &
    AdminWorkspaceRoutesDeps &
    AdminApprovalRoutesDeps &
    AdminOrgRoutesDeps &
    AdminOpsRoutesDeps &
    AdminImpersonationRoutesDeps,
  "routeGuards"
>;

function untouchedServices(): AdminRoutesDeps {
  return {
    staffSettings: { PLATFORM_ADMIN_REQUIRE_MFA: true },
    IAuthProvider: mockPort<AdminRoutesDeps["IAuthProvider"]>(),
    IListUsersQuery: mockPort<AdminRoutesDeps["IListUsersQuery"]>(),
    IGetUserQuery: mockPort<AdminRoutesDeps["IGetUserQuery"]>(),
    IListOrgsQuery: mockPort<AdminRoutesDeps["IListOrgsQuery"]>(),
    IGetOrgQuery: mockPort<AdminRoutesDeps["IGetOrgQuery"]>(),
    IListStaffNotesQuery: mockPort<AdminRoutesDeps["IListStaffNotesQuery"]>(),
    IStepUpValidityQuery: mockPort<AdminRoutesDeps["IStepUpValidityQuery"]>(),
    IStaffInboxQuery: mockPort<AdminRoutesDeps["IStaffInboxQuery"]>(),
    IListSavedViewsQuery: mockPort<AdminRoutesDeps["IListSavedViewsQuery"]>(),
    IListDeadLettersQuery: mockPort<AdminRoutesDeps["IListDeadLettersQuery"]>(),
    IListSweepRunsQuery: mockPort<AdminRoutesDeps["IListSweepRunsQuery"]>(),
    IListStripeEventsQuery: mockPort<AdminRoutesDeps["IListStripeEventsQuery"]>(),
    AdminActionService: mockPort<AdminRoutesDeps["AdminActionService"]>(),
    ApprovalService: mockPort<AdminRoutesDeps["ApprovalService"]>(),
    StaffService: mockPort<AdminRoutesDeps["StaffService"]>(),
    BanUserUseCase: mockPort<AdminRoutesDeps["BanUserUseCase"]>(),
    UnbanUserUseCase: mockPort<AdminRoutesDeps["UnbanUserUseCase"]>(),
    ResetUserPasswordUseCase: mockPort<AdminRoutesDeps["ResetUserPasswordUseCase"]>(),
    RevokeUserSessionsUseCase: mockPort<AdminRoutesDeps["RevokeUserSessionsUseCase"]>(),
    StartImpersonationUseCase: mockPort<AdminRoutesDeps["StartImpersonationUseCase"]>(),
    ChangeStaffRoleUseCase: mockPort<AdminRoutesDeps["ChangeStaffRoleUseCase"]>(),
    RevokeStaffUseCase: mockPort<AdminRoutesDeps["RevokeStaffUseCase"]>(),
    SetStaffOverrideUseCase: mockPort<AdminRoutesDeps["SetStaffOverrideUseCase"]>(),
    RemoveStaffOverrideUseCase: mockPort<AdminRoutesDeps["RemoveStaffOverrideUseCase"]>(),
    VerifyStepUpUseCase: mockPort<AdminRoutesDeps["VerifyStepUpUseCase"]>(),
    AddStaffNoteUseCase: mockPort<AdminRoutesDeps["AddStaffNoteUseCase"]>(),
    SaveViewUseCase: mockPort<AdminRoutesDeps["SaveViewUseCase"]>(),
    DeleteViewUseCase: mockPort<AdminRoutesDeps["DeleteViewUseCase"]>(),
    SetPlanOverrideUseCase: mockPort<AdminRoutesDeps["SetPlanOverrideUseCase"]>(),
    RevokePlanOverrideUseCase: mockPort<AdminRoutesDeps["RevokePlanOverrideUseCase"]>(),
    RequeueOutboxUseCase: mockPort<AdminRoutesDeps["RequeueOutboxUseCase"]>(),
    ReplayStripeEventUseCase: mockPort<AdminRoutesDeps["ReplayStripeEventUseCase"]>(),
    isReplayableStripeEvent: () => true,
  };
}

export function mountAdminRoutes(
  routeGuards: RouteGuards,
  services: Partial<AdminRoutesDeps> = {},
): Hono {
  const deps = { routeGuards, ...untouchedServices(), ...services };

  return new Hono()
    .route("/admin", createAdminStaffRoutes(deps))
    .route("/admin", createAdminWorkspaceRoutes(deps))
    .route("/admin/approvals", createAdminApprovalRoutes(deps))
    .route("/admin/users", createAdminUserRoutes(deps))
    .route("/admin/orgs", createAdminOrgRoutes(deps))
    .route("/admin/ops", createAdminOpsRoutes(deps))
    .route("/admin/impersonation", createAdminImpersonationRoutes(deps));
}
