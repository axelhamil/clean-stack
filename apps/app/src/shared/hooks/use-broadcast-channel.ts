export function createBroadcastChannel<T>(name: string) {
  const bc = typeof BroadcastChannel !== "undefined" ? new BroadcastChannel(name) : null;
  const localHandlers = new Set<(message: T) => void>();

  return {
    post(message: T): void {
      bc?.postMessage(message);
      for (const handler of localHandlers) {
        handler(message);
      }
    },
    subscribe(handler: (message: T) => void): () => void {
      localHandlers.add(handler);
      let bcListener: ((event: MessageEvent<T>) => void) | null = null;
      if (bc) {
        bcListener = (event: MessageEvent<T>) => handler(event.data);
        bc.addEventListener("message", bcListener);
      }
      return () => {
        localHandlers.delete(handler);
        if (bc && bcListener) bc.removeEventListener("message", bcListener);
      };
    },
  };
}
