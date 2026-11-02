import { Option } from "@packages/ddd-kit";

/**
 * Payload keys that name the user who triggered an event, in priority order.
 * The audit trail and the notification audience both answer "who did this?"
 * from this one list, so an event that the audit log attributes to a user is
 * never notified as if someone else had acted.
 */
export const ACTOR_KEYS = ["actorUserId", "inviterUserId", "ownerUserId", "userId"] as const;

/** First non-empty string found under `keys`, in order. */
export function readUserId(payload: unknown, keys: readonly string[]): Option<string> {
  if (typeof payload !== "object" || payload === null) return Option.none();

  const record = payload as Record<string, unknown>;
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.length > 0) return Option.some(value);
  }
  return Option.none();
}

/** An explicit null `actorUserId` declares a system action, so `userId` stays the subject. */
export function readActorId(payload: unknown): Option<string> {
  if (
    typeof payload === "object" &&
    payload !== null &&
    "actorUserId" in payload &&
    payload.actorUserId === null
  )
    return Option.none();

  return readUserId(payload, ACTOR_KEYS);
}
