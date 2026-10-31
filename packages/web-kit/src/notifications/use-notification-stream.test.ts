import { describe, expect, it, vi } from "vitest";
import { runNotificationStream } from "./use-notification-stream";

function closedStream() {
  const body = new ReadableStream<Uint8Array>({ start: (controller) => controller.close() });

  return { ok: true, status: 200, body };
}

describe("runNotificationStream", () => {
  it("calls back on each connection after the first, and not on the first", async () => {
    const controller = new AbortController();
    const onReconnect = vi.fn();
    let connections = 0;
    const connect = async () => {
      connections += 1;
      if (connections === 1) expect(onReconnect).not.toHaveBeenCalled();
      if (connections === 3) controller.abort();

      return closedStream();
    };

    await runNotificationStream(
      () => ({ connect, onNotification: () => {}, onReconnect }),
      controller.signal,
      () => {},
    );

    expect(connections).toBe(3);
    expect(onReconnect).toHaveBeenCalledTimes(2);
  });
});
