import { Option } from "@packages/ddd-kit";
import { HTTPException } from "hono/http-exception";
import type { RouteGuard, RouteGuards } from "../route-guards";

export interface FakeRequester {
  userId?: string;
  orgId?: string;
  clientIp?: string;
}

const open: RouteGuard = async (_c, next) => {
  await next();
};

export function openRouteGuards(requester: FakeRequester = {}): RouteGuards {
  const userId = Option.fromNullable(requester.userId);
  const orgId = Option.fromNullable(requester.orgId);

  return {
    requireAuth: open,
    requireOrg: open,
    requireOrgPermission: () => open,
    requireCurrentPolicies: open,
    denyImpersonated: open,
    requireStaff: open,
    requireStaffPermission: () => open,
    requireStepUp: open,
    requireFeature: () => open,
    requirePlan: () => open,
    requireQuota: () => open,
    currentUserId: () => {
      if (userId.isNone()) throw new HTTPException(401, { message: "Unauthorized" });

      return userId.unwrap();
    },
    signedInUserId: () => userId,
    currentOrgId: () => {
      if (orgId.isNone()) throw new HTTPException(403, { message: "No active organization" });

      return orgId.unwrap();
    },
    activeOrgId: () => orgId,
    clientIp: () => requester.clientIp ?? "198.51.100.7",
  };
}
