import { type QueryClient, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { api } from "../api/api-client";
import { notificationsListQueryKey } from "../api/queries/notifications";
import { addBreadcrumb } from "../observability/sentry";

const UNREAD_COUNT_QUERY_KEY = ["notifications", "unread-count"] as const;
const FRAME_SEPARATOR = /\r?\n\r?\n/;
const LINE_SEPARATOR = /\r?\n/;
const RETRY_BASE_MS = 1_000;
const RETRY_CAP_MS = 30_000;
// Server sends `event: ping` every 25s (apps/api/src/modules/notifications/routes.ts,
// `await stream.sleep(25_000)`). A stall timeout of a bit over 2x that interval tolerates
// one missed ping plus network jitter before treating a silent-but-open connection as dead.
const PING_INTERVAL_MS = 25_000;
const STALL_TIMEOUT_MS = PING_INTERVAL_MS * 2 + 5_000;

export function handleStreamChunk(chunk: string, queryClient: QueryClient): string {
  const frames = chunk.split(FRAME_SEPARATOR);
  const residue = frames.pop() ?? "";

  for (const frame of frames) {
    const isNotification = frame
      .split(LINE_SEPARATOR)
      .some((line) => line.trimEnd() === "event: notification");

    if (isNotification) {
      // The badge stays live: always invalidate+refetch the single
      // unread-count query. The list is an infinite query — if the user has
      // "load more"'d through several pages, an eager refetch here would
      // re-fetch every one of them on every single push. Mark it stale
      // instead (`refetchType: "none"`) so it catches up next time the
      // panel opens, rather than firing an N-page refetch on each event.
      void queryClient.invalidateQueries({ queryKey: UNREAD_COUNT_QUERY_KEY });
      void queryClient.invalidateQueries({
        queryKey: notificationsListQueryKey,
        refetchType: "none",
      });
    }
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

export async function consume(body: ReadableStream<Uint8Array>, queryClient: QueryClient) {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  // A silent-but-open connection (e.g. a proxy that keeps the socket up but stops
  // relaying) never rejects `reader.read()` on its own — only a rearmed stall timeout
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
      buffer = handleStreamChunk(buffer + decoder.decode(value, { stream: true }), queryClient);
    }
  } finally {
    if (stallTimer) clearTimeout(stallTimer);
  }
}

export function useNotificationStream(): { connected: boolean } {
  const queryClient = useQueryClient();
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    const { signal } = controller;
    let attempt = 0;

    const run = async () => {
      while (!signal.aborted) {
        try {
          const res = await api.notifications.stream.$get({}, { init: { signal } });
          if (!res.ok || !res.body) throw new Error(`NOTIFICATION_STREAM_${res.status}`);

          attempt = 0;
          setConnected(true);
          await consume(res.body, queryClient);
        } catch (err) {
          if (!signal.aborted) {
            addBreadcrumb("notification stream disconnected", { attempt, err: String(err) });
          }
        } finally {
          if (!signal.aborted) setConnected(false);
        }

        if (signal.aborted) return;
        await sleep(backoffDelay(attempt), signal);
        attempt += 1;
      }
    };

    void run();
    return () => controller.abort();
  }, [queryClient]);

  return { connected };
}
