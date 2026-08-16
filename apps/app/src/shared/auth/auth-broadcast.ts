import { createBroadcastChannel } from "../hooks/use-broadcast-channel";

type AuthEvent = { type: "session-changed" };

const channel = createBroadcastChannel<AuthEvent>("clean-stack-auth");

export function broadcastAuthChange(): void {
  channel.post({ type: "session-changed" });
}

export function onAuthChange(handler: () => void): () => void {
  return channel.subscribe((event) => {
    if (event.type === "session-changed") handler();
  });
}
