import { type OrgRole, rolesWith } from "@packages/access-control";
import type { Option } from "@packages/ddd-kit";
import type { Audience } from "@packages/events";
import type { OutboxRecord } from "../ports/outbox.port";
import { ACTOR_KEYS, readUserId } from "./event-actor";

export type AudienceTarget =
  | { kind: "user"; userId: string }
  | { kind: "org"; organizationId: string; roles: OrgRole[] | "all" };

const SELF_KEYS = ["userId", "ownerUserId"] as const;

const toUser = (userId: string): AudienceTarget => ({ kind: "user", userId });

export function resolveAudience(audience: Audience, event: OutboxRecord): Option<AudienceTarget> {
  if (audience === "self") return readUserId(event.payload, SELF_KEYS).map(toUser);
  if (audience === "actor") return readUserId(event.payload, ACTOR_KEYS).map(toUser);

  return event.organizationId.map(
    (organizationId): AudienceTarget => ({
      kind: "org",
      organizationId,
      roles: audience === "org:all" ? "all" : rolesWith(audience.can),
    }),
  );
}
