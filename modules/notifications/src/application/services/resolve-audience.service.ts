import { type OrgRole, rolesWith } from "@packages/access-control";
import { Option } from "@packages/ddd-kit";
import type { Audience } from "@packages/events";
import { readActorId, readUserId } from "@packages/outbox/event-actor";
import type { StaffAudienceTarget } from "../ports/services/staff-recipients.port";

export type AudienceTarget =
  | { kind: "user"; userId: string }
  | { kind: "org"; organizationId: string; roles: OrgRole[] | "all" }
  | StaffAudienceTarget;

export interface AudienceSource {
  payload: unknown;
  organizationId: Option<string>;
}

const SELF_KEYS = ["userId", "ownerUserId"] as const;

const toUser = (userId: string): AudienceTarget => ({ kind: "user", userId });

export function resolveAudience(
  audience: Audience,
  source: AudienceSource,
): Option<AudienceTarget> {
  if (audience === "self") return readUserId(source.payload, SELF_KEYS).map(toUser);
  if (audience === "actor") return readActorId(source.payload).map(toUser);
  if (typeof audience === "object" && "staff" in audience) {
    return Option.some({
      kind: "staff",
      permission: audience.staff,
      requesterUserId: readUserId(source.payload, ["requesterUserId"]),
      actorUserId: readActorId(source.payload),
      subjectUserId: readUserId(source.payload, ["userId"]),
    });
  }

  return source.organizationId.map(
    (organizationId): AudienceTarget => ({
      kind: "org",
      organizationId,
      roles: audience === "org:all" ? "all" : rolesWith(audience.can),
    }),
  );
}
