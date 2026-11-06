import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { runNotificationStream } from "./use-notification-stream";

function closedStream() {
  const body = new ReadableStream<Uint8Array>({ start: (controller) => controller.close() });

  return { ok: true, status: 200, body };
}

describe("runNotificationStream", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("calls back on every connection, the first included", async () => {
    const controller = new AbortController();
    const onConnect = vi.fn();
    let connections = 0;
    const connect = async () => {
      connections += 1;
      if (connections === 3) controller.abort();

      return closedStream();
    };

    const run = runNotificationStream(
      () => ({ connect, onNotification: () => {}, onConnect }),
      controller.signal,
      () => {},
    );
    await vi.runAllTimersAsync();
    await run;

    expect(connections).toBe(3);
    expect(onConnect).toHaveBeenCalledTimes(3);
  });

  it("calls back once the stream connects after a first refused attempt", async () => {
    const controller = new AbortController();
    const onConnect = vi.fn();
    let connections = 0;
    const connect = async () => {
      connections += 1;
      if (connections === 1) return { ok: false, status: 429, body: null };
      controller.abort();

      return closedStream();
    };

    const run = runNotificationStream(
      () => ({ connect, onNotification: () => {}, onConnect }),
      controller.signal,
      () => {},
    );
    await vi.runAllTimersAsync();
    await run;

    expect(connections).toBe(2);
    expect(onConnect).toHaveBeenCalledTimes(1);
  });
});
