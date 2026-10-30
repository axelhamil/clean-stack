export function createBroadcastChannel<T>(name: string) {
  const channel = typeof BroadcastChannel !== "undefined" ? new BroadcastChannel(name) : null;

  return {
    post(message: T): void {
      channel?.postMessage(message);
    },
    subscribe(handler: (message: T) => void): () => void {
      if (!channel) return () => {};
      const listener = (event: MessageEvent<T>) => handler(event.data);
      channel.addEventListener("message", listener);
      return () => channel.removeEventListener("message", listener);
    },
  };
}
