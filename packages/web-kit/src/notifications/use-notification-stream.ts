import { useEffect, useRef, useState } from "react";

const FRAME_SEPARATOR = /\r?\n\r?\n/;
const LINE_SEPARATOR = /\r?\n/;
const RETRY_BASE_MS = 1_000;
const RETRY_CAP_MS = 30_000;
// The server sends `event: ping` every 25s. A stall timeout of a bit over 2x that interval tolerates
// one missed ping plus network jitter before treating a silent-but-open connection as dead.
const PING_INTERVAL_MS = 25_000;
const STALL_TIMEOUT_MS = PING_INTERVAL_MS * 2 + 5_000;

export function handleStreamChunk(chunk: string, onNotification: () => void): string {
  const frames = chunk.split(FRAME_SEPARATOR);
  const residue = frames.pop() ?? "";

  for (const frame of frames) {
    const isNotification = frame
      .split(LINE_SEPARATOR)
      .some((line) => line.trimEnd() === "event: notification");

    if (isNotification) onNotification();
  }

  return residue;
}

const backoffDelay = (attempt: number) => {
  const exponential = Math.min(RETRY_CAP_MS, RETRY_BASE_MS * 2 ** attempt);
  return exponential / 2 + Math.random() * (exponential / 2);
};

const sleep = (ms: number, signal: AbortSignal) =>
  new Promise<void>((resolve) => {
    const timer = setTimeout(resolve, ms);
    signal.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        resolve();
      },
      { once: true },
    );
  });

export async function consume(body: ReadableStream<Uint8Array>, onNotification: () => void) {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  // A silent-but-open connection (e.g. a proxy that keeps the socket up but stops
  // relaying) never rejects `reader.read()` on its own: only a rearmed stall timeout
  // that cancels the reader can surface it. Rearmed on every frame, `ping` included, not
  // just notifications, so a healthy but quiet stream never trips it.
  let stallTimer: ReturnType<typeof setTimeout> | null = null;
  const armStallTimer = () => {
    if (stallTimer) clearTimeout(stallTimer);
    stallTimer = setTimeout(() => {
      void reader.cancel(new Error("NOTIFICATION_STREAM_STALLED"));
    }, STALL_TIMEOUT_MS);
  };

  try {
    armStallTimer();
    while (true) {
      const { done, value } = await reader.read();
      if (done) return;
      armStallTimer();
      buffer = handleStreamChunk(buffer + decoder.decode(value, { stream: true }), onNotification);
    }
  } finally {
    if (stallTimer) clearTimeout(stallTimer);
  }
}

export interface NotificationStreamResponse {
  ok: boolean;
  status: number;
  body: ReadableStream<Uint8Array> | null;
}

export interface NotificationStreamOptions {
  connect: (signal: AbortSignal) => Promise<NotificationStreamResponse>;
  onNotification: () => void;
  onDisconnect?: (attempt: number, error: unknown) => void;
  onReconnect?: () => void;
}

export async function runNotificationStream(
  options: () => NotificationStreamOptions,
  signal: AbortSignal,
  setConnected: (connected: boolean) => void,
): Promise<void> {
  let attempt = 0;
  let hasConnected = false;

  while (!signal.aborted) {
    try {
      const res = await options().connect(signal);
      if (!res.ok || !res.body) throw new Error(`NOTIFICATION_STREAM_${res.status}`);

      attempt = 0;
      setConnected(true);
      if (hasConnected) options().onReconnect?.();
      hasConnected = true;
      await consume(res.body, () => options().onNotification());
    } catch (err) {
      if (!signal.aborted) options().onDisconnect?.(attempt, err);
    } finally {
      if (!signal.aborted) setConnected(false);
    }

    if (signal.aborted) return;
    await sleep(backoffDelay(attempt), signal);
    attempt += 1;
  }
}

export function useNotificationStreamConnection(options: NotificationStreamOptions): {
  connected: boolean;
} {
  const latest = useRef(options);
  latest.current = options;
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    const controller = new AbortController();

    void runNotificationStream(() => latest.current, controller.signal, setConnected);

    return () => controller.abort();
  }, []);

  return { connected };
}
