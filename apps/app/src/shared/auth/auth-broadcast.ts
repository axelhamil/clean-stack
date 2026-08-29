import { createBroadcastChannel } from "../hooks/use-broadcast-channel";
import { resetChosenLocale } from "../i18n/locale-reconciliation";

type AuthEvent = { type: "session-changed" };

const channel = createBroadcastChannel<AuthEvent>("clean-stack-auth");

/**
 * Every identity change clears the "locale the user just picked" marker.
 *
 * The marker exists only to stop the session reconciliation from re-asserting
 * a cached user row that is knowably behind the save. It is scoped to one
 * person: left standing across a sign-out, it makes the next user of the same
 * tab read the UI in the previous user's language until a hard reload. Doing it
 * here rather than at each sign-out call site is what makes it hold for every
 * path that ends a session, in every tab.
 */
export function broadcastAuthChange(): void {
  resetChosenLocale();
  channel.post({ type: "session-changed" });
}

export function onAuthChange(handler: () => void): () => void {
  return channel.subscribe((event) => {
    if (event.type !== "session-changed") return;
    resetChosenLocale();
    handler();
  });
}
