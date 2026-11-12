import { sso } from "@better-auth/sso";

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
