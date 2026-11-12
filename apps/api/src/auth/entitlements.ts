import { hasFeature } from "@modules/billing/domain/entitlements";
import { APIError } from "better-auth/api";
import type { AuthDeps } from "./deps";

export function createSsoEntitlements(deps: Pick<AuthDeps, "entitlements">): {
  assertSsoEntitlementFor(organizationId: string | undefined): Promise<void>;
  hasSsoEntitlement(organizationId: string): Promise<boolean>;
} {
  return {
    /**
     * The enterprise entitlement gate on `/sso/register`. Takes the org the REQUEST
     * names, never one inferred from session history, because that is the only org
     * whose plan is actually being spent. The SCIM half of the same paid capability is
     * gated where its connection is issued (`requireFeature("sso")` on
     * `/settings/organization/scim-connection`) and again on every provisioning, through
     * `hasSsoEntitlement`: an organization that lost the plan keeps its directory's
     * removals, never its additions.
     */
    async assertSsoEntitlementFor(organizationId) {
      if (!organizationId) {
        throw new APIError("FORBIDDEN", { message: "SSO_ORGANIZATION_REQUIRED" });
      }
      const entitlements = await deps.entitlements.getEntitlements(organizationId);
      if (!hasFeature(entitlements, "sso")) {
        throw new APIError("FORBIDDEN", { message: "SSO_PLAN_REQUIRED" });
      }
    },

    async hasSsoEntitlement(organizationId) {
      const entitlements = await deps.entitlements.getEntitlements(organizationId);
      return hasFeature(entitlements, "sso");
    },
  };
}
