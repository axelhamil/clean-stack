import { EventTypes } from "@packages/events";
import { APIError } from "better-auth/api";
import type { Emit } from "./emit";
import type { AuthQueries } from "./queries";
import { type AuthSnapshots, SNAPSHOT_TTL_MS } from "./snapshots";
import { changedFieldsFrom, scimUserChange } from "./sso-paths";

type ScimEventQueries = Pick<
  AuthQueries,
  "findMemberOf" | "findScimUser" | "scimConnectionCreator"
>;

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
  emit: Emit,
  queries: ScimEventQueries,
  userId: string,
  organizationId: string,
  actorUserId: string | null,
): Promise<void> {
  const member = await queries.findMemberOf(userId, organizationId);
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
async function emitScimUserEvents(
  emit: Emit,
  queries: ScimEventQueries,
  snapshots: AuthSnapshots,
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

  const before = method === "POST" ? undefined : snapshots.scimUserSnapshots.take(scimUserId);
  const after = method === "DELETE" ? undefined : await queries.findScimUser(scimUserId);
  const subject = after ?? before;
  if (!subject) return;

  const change = scimUserChange(method, before, after);
  if (!change) return;

  const { userId, organizationId, connectionId, externalId } = subject;
  const actorUserId = await queries.scimConnectionCreator(connectionId);
  const base = { userId, actorUserId, organizationId, scimProviderId: connectionId, externalId };
  const eventType = {
    created: EventTypes.SCIM_USER_CREATED,
    updated: EventTypes.SCIM_USER_UPDATED,
    deactivated: EventTypes.SCIM_USER_DEACTIVATED,
    deprovisioned: EventTypes.SCIM_USER_DEPROVISIONED,
  }[change];
  const payload = change === "updated" ? { ...base, changedFields: changedFieldsFrom(body) } : base;
  await emit(eventType, "user", userId, payload, organizationId);

  await emitScimMemberJoined(emit, queries, userId, organizationId, actorUserId);

  const removedMemberId = before?.memberId;
  if (!removedMemberId || (await queries.findMemberOf(userId, organizationId))) return;
  await emit(
    EventTypes.ORG_MEMBER_REMOVED,
    "member",
    removedMemberId,
    { organizationId, actorUserId, userId },
    organizationId,
  );
}

export function createScimEvents(
  emit: Emit,
  queries: ScimEventQueries,
  snapshots: AuthSnapshots,
): {
  emitScimUserEvents(
    method: string | undefined,
    returned: unknown,
    params: unknown,
    body: Record<string, unknown> | undefined,
  ): Promise<void>;
} {
  return {
    emitScimUserEvents: (method, returned, params, body) =>
      emitScimUserEvents(emit, queries, snapshots, method, returned, params, body),
  };
}
