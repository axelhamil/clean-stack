type AuthEvent = { type: "session-changed" };

const channel =
  typeof BroadcastChannel !== "undefined"
    ? new BroadcastChannel("clean-stack-auth")
    : null;

export function broadcastAuthChange(): void {
  channel?.postMessage({ type: "session-changed" } satisfies AuthEvent);
}

export function onAuthChange(handler: () => void): () => void {
  if (!channel) return () => {};
  const listener = (event: MessageEvent<AuthEvent>) => {
    if (event.data.type === "session-changed") handler();
  };
  channel.addEventListener("message", listener);
  return () => channel.removeEventListener("message", listener);
}
