import { type SCIMEndpoints, type SCIMPlugin, scim } from "@better-auth/scim";
import { EventTypes } from "@packages/events";
import { APIError } from "better-auth/api";
import { scimIdentityResolver, scimMembershipProjection } from "../../shared/auth/scim-membership";
import { changedFieldsFrom, scimUserChange } from "../../shared/auth/sso-paths";
import { env } from "../../shared/env";
import { emit } from "../emit";
import {
  findMemberOf,
  findScimUser,
  isVerifiedSsoDomainOf,
  scimConnectionCreator,
} from "../queries";
import { SNAPSHOT_TTL_MS, scimUserSnapshots } from "../snapshots";
import { seatCapFor } from "./organization";
import { hasSsoEntitlement } from "./sso";

/**
 * Bridges `org.member.joined` for the SCIM provisioning path. The member row is
 * written by `scimMembershipProjection` through the plugin's transaction adapter,
 * so `organizationHooks.afterAddMember`, where every other surface emits this
 * event, never fires: without this bridge an IdP-provisioned member leaves no audit
 * row and no webhook delivery (rule #6). Same aggregate and same payload shape as
 * `afterAddMember`; the provisioned user is the subject, the connection owner is the
 * actor (rule #7).
 *
 * The projection leaves an existing membership alone (SCIM linking someone who
 * joined by invitation), and an after-hook cannot tell the two apart, `createdAt`
 * can: a row this request wrote is seconds old. Without the window,
 * re-provisioning an existing member would emit a false "joined".
 */
async function emitScimMemberJoined(
  userId: string,
  organizationId: string,
  actorUserId: string | null,
): Promise<void> {
  const member = await findMemberOf(userId, organizationId);
  if (!member || member.createdAt.getTime() < Date.now() - SNAPSHOT_TTL_MS) return;
  await emit(
    EventTypes.ORG_MEMBER_JOINED,
    "member",
    member.id,
    {
      organizationId,
      userId,
      role: member.role,
      actorUserId: actorUserId ?? undefined,
    },
    organizationId,
  );
}

/**
 * The events of a successful `/scim/v2/Users` write: the SCIM lifecycle event, and
 * the membership change the projection made in the same transaction. Runs only
 * after the plugin committed, so a refused or rolled-back request emits nothing.
 *
 * The subject is the Better Auth user, never the SCIM resource id the directory
 * sees; the actor is the connection's creator (rule #7), a bearer request having
 * no session. A creation reads the stored row back through the id the response
 * carries; every other write reads the snapshot `hooks.before` took, the only
 * record of a deleted user and the only "before" a deactivation can be told from.
 */
export async function emitScimUserEvents(
  method: string | undefined,
  returned: unknown,
  params: unknown,
  body: Record<string, unknown> | undefined,
): Promise<void> {
  if (!method || returned instanceof APIError) return;

  const scimUserId =
    method === "POST"
      ? (returned as { id?: string } | undefined)?.id
      : (params as Record<string, string> | undefined)?.userId;
  if (!scimUserId) return;

  const before = method === "POST" ? undefined : scimUserSnapshots.take(scimUserId);
  const after = method === "DELETE" ? undefined : await findScimUser(scimUserId);
  const subject = after ?? before;
  if (!subject) return;

  const change = scimUserChange(method, before, after);
  if (!change) return;

  const { userId, organizationId, connectionId, externalId } = subject;
  const actorUserId = await scimConnectionCreator(connectionId);
  const base = { userId, actorUserId, organizationId, scimProviderId: connectionId, externalId };
  const eventType = {
    created: EventTypes.SCIM_USER_CREATED,
    updated: EventTypes.SCIM_USER_UPDATED,
    deactivated: EventTypes.SCIM_USER_DEACTIVATED,
    deprovisioned: EventTypes.SCIM_USER_DEPROVISIONED,
  }[change];
  const payload = change === "updated" ? { ...base, changedFields: changedFieldsFrom(body) } : base;
  await emit(eventType, "user", userId, payload, organizationId);

  await emitScimMemberJoined(userId, organizationId, actorUserId);

  const removedMemberId = before?.memberId;
  if (!removedMemberId || (await findMemberOf(userId, organizationId))) return;
  await emit(
    EventTypes.ORG_MEMBER_REMOVED,
    "member",
    removedMemberId,
    { organizationId, actorUserId, userId },
    organizationId,
  );
}

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
