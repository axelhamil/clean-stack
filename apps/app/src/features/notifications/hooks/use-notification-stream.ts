import { type QueryClient, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { api } from "../../../shared/api/api-client";
import { addBreadcrumb } from "../../../shared/observability/sentry";

const NOTIFICATIONS_QUERY_KEY = ["notifications"] as const;
const FRAME_SEPARATOR = /\r?\n\r?\n/;
const LINE_SEPARATOR = /\r?\n/;
const RETRY_BASE_MS = 1_000;
const RETRY_CAP_MS = 30_000;

export function handleStreamChunk(chunk: string, queryClient: QueryClient): string {
  const frames = chunk.split(FRAME_SEPARATOR);
  const residue = frames.pop() ?? "";

  for (const frame of frames) {
    const isNotification = frame
      .split(LINE_SEPARATOR)
      .some((line) => line.trimEnd() === "event: notification");

    if (isNotification) {
      void queryClient.invalidateQueries({ queryKey: NOTIFICATIONS_QUERY_KEY });
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

async function consume(body: ReadableStream<Uint8Array>, queryClient: QueryClient) {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) return;
    buffer = handleStreamChunk(buffer + decoder.decode(value, { stream: true }), queryClient);
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
