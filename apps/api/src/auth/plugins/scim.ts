import { type SCIMEndpoints, type SCIMPlugin, scim } from "@better-auth/scim";
import type { AuthDeps } from "../deps";
import type { AuthHelpers } from "../helpers";
import { isVerifiedSsoDomainOf } from "../queries";
import { scimIdentityResolver, scimMembershipProjection } from "../scim-membership";

/**
 * `@better-auth/scim` leaks an unexported interface (`SCIMDiscoveryAttribute`)
 * through the response types of its two schema-discovery endpoints, and the
 * exported `auth` type then cannot be named (TS4023). Both endpoints are served to
 * directories over HTTP and never called through `auth.api`, so the plugin is typed
 * without them: an annotation that only drops keys, the runtime object is untouched.
 */
export type ScimPluginWithoutDiscoveryTypes = Omit<SCIMPlugin, "endpoints"> & {
  endpoints: Omit<SCIMEndpoints, "getSCIMSchemas" | "getSCIMSchema">;
};

// Exported for `scripts/check-scim-seats.ts`, which runs the real seat check against
// Postgres under concurrent provisioning.
export function scimMembershipDepsOf(
  helpers: Pick<AuthHelpers, "seatCapFor" | "hasSsoEntitlement">,
) {
  return {
    seatCapFor: helpers.seatCapFor,
    isVerifiedSsoDomainOf,
    hasSsoEntitlement: helpers.hasSsoEntitlement,
  };
}

// Plugin-managed connections: one per organization, created, rotated and
// decommissioned by `ScimConnectionService` behind the owner-only
// `/settings/organization/scim-connection` routes. The organization id is the
// provisioning domain, and the projection is what turns a directory's users into
// members of it (the plugin itself knows nothing of organizations).
export function scimPlugin(
  deps: Pick<AuthDeps, "settings">,
  helpers: Pick<AuthHelpers, "seatCapFor" | "hasSsoEntitlement">,
): ScimPluginWithoutDiscoveryTypes {
  const membershipDeps = scimMembershipDepsOf(helpers);

  return scim({
    connections: [],
    managedConnections: {
      credentialHashSecret: deps.settings.scimCredentialHashSecret,
    },
    identity: scimIdentityResolver(membershipDeps),
    projection: scimMembershipProjection(membershipDeps),
  });
}
