import { createBroadcastChannel } from "../broadcast-channel";

type AuthEvent = { type: "session-changed"; identityChanged: boolean };

export interface BroadcastAuthChangeOptions {
  /**
   * Set only when the *person* behind the session changed: sign-out,
   * impersonation start, impersonation stop. Most callers of this function
   * (profile save, avatar upload, org switch, session revoke, ...) refresh
   * the same person's session and must leave this false.
   */
  identityChanged?: boolean;
}

interface AuthBroadcastConfig {
  channelName: string;
  onIdentityChange?: () => void;
}

export function createAuthBroadcast({ channelName, onIdentityChange }: AuthBroadcastConfig) {
  const channel = createBroadcastChannel<AuthEvent>(channelName);

  return {
    broadcastAuthChange(options: BroadcastAuthChangeOptions = {}): void {
      const identityChanged = options.identityChanged ?? false;
      if (identityChanged) onIdentityChange?.();
      channel.post({ type: "session-changed", identityChanged });
    },

    onAuthChange(handler: () => void): () => void {
      return channel.subscribe((event) => {
        if (event.type !== "session-changed") return;
        if (event.identityChanged) onIdentityChange?.();
        handler();
      });
    },
  };
}
