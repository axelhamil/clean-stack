import { type OrgRole, rolesWith } from "@packages/access-control";
import type { Audience } from "@packages/events";
import type { OutboxRecord } from "../ports/outbox.port";

export type AudienceTarget =
  | { kind: "user"; userId: string }
  | { kind: "org"; organizationId: string; roles: OrgRole[] | "all" };

function readUserId(payload: unknown, keys: readonly string[]): string | null {
  if (typeof payload !== "object" || payload === null) return null;
  const record = payload as Record<string, unknown>;
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.length > 0) return value;
  }
  return null;
}

export function resolveAudience(audience: Audience, event: OutboxRecord): AudienceTarget | null {
  if (audience === "self") {
    const userId = readUserId(event.payload, ["userId", "ownerUserId"]);
    return userId ? { kind: "user", userId } : null;
  }

  if (audience === "actor") {
    const userId = readUserId(event.payload, [
      "actorUserId",
      "inviterUserId",
      "ownerUserId",
      "userId",
    ]);
    return userId ? { kind: "user", userId } : null;
  }

  if (event.organizationId.isNone()) return null;
  const organizationId = event.organizationId.unwrap();

  if (audience === "org:all") return { kind: "org", organizationId, roles: "all" };

  return { kind: "org", organizationId, roles: rolesWith(audience.can) };
}
