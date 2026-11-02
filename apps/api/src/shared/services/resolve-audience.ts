import { type OrgRole, rolesWith, type StaffPermission } from "@packages/access-control";
import { Option } from "@packages/ddd-kit";

import type { Audience } from "@packages/events";
import type { DeliveredEvent } from "../ports/outbox.port";
import { readActorId, readUserId } from "./event-actor";

export type AudienceTarget =
  | { kind: "user"; userId: string }
  | { kind: "org"; organizationId: string; roles: OrgRole[] | "all" }
  | {
      kind: "staff";
      permission: StaffPermission;
      requesterUserId: Option<string>;
      actorUserId: Option<string>;
      subjectUserId: Option<string>;
    };

const SELF_KEYS = ["userId", "ownerUserId"] as const;

const toUser = (userId: string): AudienceTarget => ({ kind: "user", userId });

export function resolveAudience(audience: Audience, event: DeliveredEvent): Option<AudienceTarget> {
  if (audience === "self") return readUserId(event.payload, SELF_KEYS).map(toUser);
  if (audience === "actor") return readActorId(event.payload).map(toUser);
  if (typeof audience === "object" && "staff" in audience) {
    return Option.some({
      kind: "staff",
      permission: audience.staff,
      requesterUserId: readUserId(event.payload, ["requesterUserId"]),
      actorUserId: readActorId(event.payload),
      subjectUserId: readUserId(event.payload, ["userId"]),
    });
  }

  return Option.fromNullable(event.organizationId).map(
    (organizationId): AudienceTarget => ({
      kind: "org",
      organizationId,
      roles: audience === "org:all" ? "all" : rolesWith(audience.can),
    }),
  );
}
