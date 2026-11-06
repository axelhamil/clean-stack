import type { OrgPermissions, StaffPermission, Tier } from "@packages/access-control";
import type { ILogger } from "@packages/ddd-kit";
import type { Context, MiddlewareHandler } from "hono";

export interface RouteEnv {
  Variables: { logger: ILogger; requestId: string };
}

export type RouteGuard = MiddlewareHandler;

export interface RouteGuards<TFeature extends string = string, TQuota extends string = string> {
  requireAuth: RouteGuard;
  requireOrg: RouteGuard;
  requireOrgPermission(permissions: OrgPermissions): RouteGuard;
  requireCurrentPolicies: RouteGuard;
  denyImpersonated: RouteGuard;
  requireStaff: RouteGuard;
  requireStaffPermission(permission: StaffPermission): RouteGuard;
  requireStepUp: RouteGuard;
  requireFeature(feature: TFeature): RouteGuard;
  requirePlan(minTier: Tier): RouteGuard;
  requireQuota(key: TQuota, readUsage: (c: Context) => Promise<number>): RouteGuard;
}
