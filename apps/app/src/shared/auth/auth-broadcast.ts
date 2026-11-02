import { createAuthBroadcast } from "@packages/web-kit/auth/auth-broadcast";
import { resetChosenLocale } from "../i18n/locale-reconciliation";

/**
 * An identity change clears the "locale the user just picked" marker.
 *
 * The marker exists only to stop the session reconciliation from re-asserting
 * a cached user row that is knowably behind the save. It is scoped to one
 * person: left standing across a sign-out, it makes the next user of the same
 * tab read the UI in the previous user's language until a hard reload.
 * Gating it on `identityChanged` (rather than firing on every broadcast) is
 * what keeps a same-person refresh (a profile save, an avatar upload) from
 * reverting the language the person just picked before that save.
 */
export const { broadcastAuthChange, onAuthChange } = createAuthBroadcast({
  channelName: "clean-stack-auth",
  onIdentityChange: resetChosenLocale,
});
