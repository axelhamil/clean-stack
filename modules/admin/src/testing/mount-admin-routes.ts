import type { RouteGuards } from "@packages/http/route-guards";
import { mockPort } from "@packages/test/bun";
import { Hono } from "hono";
import {
  type AdminUserRoutesDeps,
  createAdminUserRoutes,
} from "../infrastructure/http/admin.routes";
import {
  type AdminImpersonationRoutesDeps,
  createAdminImpersonationRoutes,
} from "../infrastructure/http/admin-impersonation.routes";
import {
  type AdminOrgRoutesDeps,
  createAdminOrgRoutes,
} from "../infrastructure/http/admin-orgs.routes";
import {
  type AdminApprovalRoutesDeps,
  createAdminApprovalRoutes,
} from "../infrastructure/http/approvals.routes";
import { type AdminOpsRoutesDeps, createAdminOpsRoutes } from "../infrastructure/http/ops.routes";
import {
  type AdminStaffRoutesDeps,
  createAdminStaffRoutes,
} from "../infrastructure/http/staff.routes";
import {
  type AdminWorkspaceRoutesDeps,
  createAdminWorkspaceRoutes,
} from "../infrastructure/http/workspace.routes";

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
    AdminQueryService: mockPort<AdminRoutesDeps["AdminQueryService"]>(),
    AdminModerationService: mockPort<AdminRoutesDeps["AdminModerationService"]>(),
    AdminActionService: mockPort<AdminRoutesDeps["AdminActionService"]>(),
    ApprovalService: mockPort<AdminRoutesDeps["ApprovalService"]>(),
    StaffService: mockPort<AdminRoutesDeps["StaffService"]>(),
    StaffNoteService: mockPort<AdminRoutesDeps["StaffNoteService"]>(),
    StepUpService: mockPort<AdminRoutesDeps["StepUpService"]>(),
    InboxService: mockPort<AdminRoutesDeps["InboxService"]>(),
    SavedViewService: mockPort<AdminRoutesDeps["SavedViewService"]>(),
    PlanOverrideService: mockPort<AdminRoutesDeps["PlanOverrideService"]>(),
    OpsService: mockPort<AdminRoutesDeps["OpsService"]>(),
    StripeReplayService: mockPort<AdminRoutesDeps["StripeReplayService"]>(),
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
