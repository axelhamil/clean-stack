import type { RequestSnapshots } from "./request-snapshots";

export interface ScimDeprovisionActor {
  actorUserId: string;
  organizationId: string;
}

/**
 * Who removed a member. The organization plugin hands its removal hook the session
 * user, which on a SCIM deprovisioning is the *removed* user (bearer requests carry no
 * session). `hooks.before` snapshotted the verified connection owner for that request;
 * it wins when its organization matches this removal, because a snapshot for another
 * org belongs to some other request (see `RequestSnapshots`).
 */
export function memberRemovalActor(
  scimActors: RequestSnapshots<ScimDeprovisionActor>,
  removal: { removedUserId: string; organizationId: string; sessionUserId: string },
): string {
  const scimActor = scimActors.take(
    removal.removedUserId,
    (snapshot) => snapshot.organizationId === removal.organizationId,
  );

  return scimActor?.actorUserId ?? removal.sessionUserId;
}
