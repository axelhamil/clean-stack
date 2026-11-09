import type { Feature, QuotaKey, StaffAccess } from "@packages/access-control";
import { Option } from "@packages/ddd-kit";
import type { CurrentSession, RouteGuards } from "@packages/http/route-guards";
import type { Context } from "hono";
import { HTTPException } from "hono/http-exception";
import type { SessionData, SessionUser } from "../auth";
import { requireAuth } from "../shared/middleware/auth.middleware";
import { requireFeature, requirePlan, requireQuota } from "../shared/middleware/billing.middleware";
import { denyImpersonated } from "../shared/middleware/deny-impersonated.middleware";
import { requireOrg, requireOrgPermission } from "../shared/middleware/org.middleware";
import { requireCurrentPolicies } from "../shared/middleware/policy.middleware";
import { resolveClientIp } from "../shared/middleware/rate-limit.ip";
import {
  assertStepUp,
  requireStaff,
  requireStaffPermission,
  requireStepUp,
} from "../shared/middleware/staff.middleware";

export type AppRouteGuards = RouteGuards<Feature, QuotaKey>;

function sessionUser(c: Context): Option<SessionUser> {
  const user: SessionUser | null | undefined = c.get("user");

  return Option.fromNullable(user);
}

function signedIn(c: Context): { user: SessionUser; session: SessionData } {
  const user = sessionUser(c);
  const session: SessionData | null | undefined = c.get("session");
  if (user.isNone() || !session) throw new HTTPException(401, { message: "Unauthorized" });

  return { user: user.unwrap(), session };
}

export const routeGuards: AppRouteGuards = {
  requireAuth,
  requireOrg,
  requireOrgPermission,
  requireCurrentPolicies,
  denyImpersonated,
  requireStaff,
  requireStaffPermission,
  requireStepUp,
  requireFeature,
  requirePlan,
  requireQuota,
  currentUserId: (c) => {
    const user = sessionUser(c);
    if (user.isNone()) throw new HTTPException(401, { message: "Unauthorized" });

    return user.unwrap().id;
  },
  signedInUserId: (c) => sessionUser(c).map((user) => user.id),
  currentOrgId: (c) => {
    const orgId: string | undefined = c.get("orgId");
    if (!orgId) {
      throw new HTTPException(500, {
        message: "currentOrgId: orgId missing, chain requireOrg before",
      });
    }

    return orgId;
  },
  activeOrgId: (c) => {
    const session: SessionData | null | undefined = c.get("session");

    return Option.fromNullable(session?.activeOrganizationId);
  },
  clientIp: resolveClientIp,
  currentSession: (c): CurrentSession => {
    const { user, session } = signedIn(c);

    return {
      id: session.id,
      userId: user.id,
      email: user.email,
      twoFactorEnabled: user.twoFactorEnabled === true,
      impersonatedBy: Option.fromNullable(session.impersonatedBy),
    };
  },
  currentStaff: (c) => {
    const staff: StaffAccess | undefined = c.get("staff");
    if (!staff) {
      throw new HTTPException(500, {
        message: "currentStaff: staff missing, chain requireStaff before",
      });
    }

    return staff;
  },
  assertStepUp: async (c) => {
    const { user, session } = signedIn(c);

    await assertStepUp(user, session);
  },
};
