import { type SCIMEndpoints, type SCIMPlugin, scim } from "@better-auth/scim";
import { scimIdentityResolver, scimMembershipProjection } from "../../shared/auth/scim-membership";
import { env } from "../../shared/env";
import { hasSsoEntitlement } from "../entitlements";
import { isVerifiedSsoDomainOf } from "../queries";
import { seatCapFor } from "../seats";

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
export const scimMembershipDeps = { seatCapFor, isVerifiedSsoDomainOf, hasSsoEntitlement };

// Plugin-managed connections: one per organization, created, rotated and
// decommissioned by `ScimConnectionService` behind the owner-only
// `/settings/organization/scim-connection` routes. The organization id is the
// provisioning domain, and the projection is what turns a directory's users into
// members of it (the plugin itself knows nothing of organizations).
export function scimPlugin(): ScimPluginWithoutDiscoveryTypes {
  return scim({
    connections: [],
    managedConnections: {
      credentialHashSecret:
        env.SCIM_CREDENTIAL_HASH_SECRET ?? "dev-only-scim-credential-secret-not-for-production-use",
    },
    identity: scimIdentityResolver(scimMembershipDeps),
    projection: scimMembershipProjection(scimMembershipDeps),
  });
}
