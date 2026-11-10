import { sso } from "@better-auth/sso";
import { hasFeature } from "@modules/billing/domain/entitlements";
import { APIError } from "better-auth/api";
import { di } from "../../container";

/**
 * The enterprise entitlement gate on `/sso/register`. Takes the org the REQUEST
 * names, never one inferred from session history, because that is the only org
 * whose plan is actually being spent. The SCIM half of the same paid capability is
 * gated where its connection is issued (`requireFeature("sso")` on
 * `/settings/organization/scim-connection`) and again on every provisioning, through
 * `hasSsoEntitlement`: an organization that lost the plan keeps its directory's
 * removals, never its additions.
 */
export async function assertSsoEntitlementFor(organizationId: string | undefined): Promise<void> {
  if (!organizationId) {
    throw new APIError("FORBIDDEN", { message: "SSO_ORGANIZATION_REQUIRED" });
  }
  const entitlements = await di.EntitlementsService.getEntitlements(organizationId);
  if (!hasFeature(entitlements, "sso")) {
    throw new APIError("FORBIDDEN", { message: "SSO_PLAN_REQUIRED" });
  }
}

export async function hasSsoEntitlement(organizationId: string): Promise<boolean> {
  const entitlements = await di.EntitlementsService.getEntitlements(organizationId);
  return hasFeature(entitlements, "sso");
}

export function ssoPlugin() {
  return sso({
    domainVerification: { enabled: true },
    defaultOverrideUserInfo: false,
    organizationProvisioning: { disabled: false, defaultRole: "member" },
    // `providersLimit` only ever receives `user` (no ctx, no request body, verified
    // against the plugin's dist), so it cannot see which org a registration targets.
    // The business-tier gate lives in hooks.before on "/sso/register" instead, where
    // body.organizationId is available; this stays a flat anti-abuse ceiling per user.
    providersLimit: 10,
  });
}
