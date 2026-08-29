import { createBroadcastChannel } from "../hooks/use-broadcast-channel";
import { resetChosenLocale } from "../i18n/locale-reconciliation";

type AuthEvent = { type: "session-changed"; identityChanged: boolean };

const channel = createBroadcastChannel<AuthEvent>("clean-stack-auth");

export interface BroadcastAuthChangeOptions {
  /**
   * Set only when the *person* behind the session changed — sign-out,
   * impersonation start, impersonation stop. Most callers of this function
   * (profile save, avatar upload, org switch, session revoke, ...) refresh
   * the same person's session and must leave this false.
   */
  identityChanged?: boolean;
}

/**
 * An identity change clears the "locale the user just picked" marker.
 *
 * The marker exists only to stop the session reconciliation from re-asserting
 * a cached user row that is knowably behind the save. It is scoped to one
 * person: left standing across a sign-out, it makes the next user of the same
 * tab read the UI in the previous user's language until a hard reload.
 * Gating it on `identityChanged` (rather than firing on every broadcast) is
 * what keeps a same-person refresh — a profile save, an avatar upload — from
 * reverting the language the person just picked before that save.
 */
export function broadcastAuthChange(options: BroadcastAuthChangeOptions = {}): void {
  const identityChanged = options.identityChanged ?? false;
  if (identityChanged) resetChosenLocale();
  channel.post({ type: "session-changed", identityChanged });
}

export function onAuthChange(handler: () => void): () => void {
  return channel.subscribe((event) => {
    if (event.type !== "session-changed") return;
    if (event.identityChanged) resetChosenLocale();
    handler();
  });
}
