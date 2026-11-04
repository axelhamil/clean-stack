import { describe, expect, it, mock } from "bun:test";
import { Option } from "@packages/ddd-kit";
import type { Logger } from "../logger";

const { NoOpInstrumentation } = await import("../services/noop-instrumentation");

const logger = {
  info: mock(() => {}),
  warn: mock(() => {}),
  error: mock(() => {}),
} as unknown as Logger;

const { notifyBatchSender } = await import("../services/notify-batch-sender.service");

describe("notifyBatchSender", () => {
  it("logs and succeeds in dev when no API key is configured", async () => {
    const result = await notifyBatchSender(null, new NoOpInstrumentation(), logger).batchSend(
      [{ to: "a@x.test", from: "b@x.test", subject: "hi", html: "<p>x</p>" }],
      Option.none(),
    );

    expect(result.error).toBeNull();
    expect(result.data).toEqual([{ id: "dev-0" }]);
    expect(logger.info).toHaveBeenCalled();
  });

  it("aborts a send that outlives its timeout and reports it as a retryable failure", async () => {
    const instrumentation = new NoOpInstrumentation();
    const originalFetch = globalThis.fetch;
    globalThis.fetch = ((_input: RequestInfo | URL, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () =>
          reject(new DOMException("Aborted", "AbortError")),
        );
      })) as unknown as typeof fetch;

    try {
      const result = await notifyBatchSender("test-key", instrumentation, logger, 10).batchSend(
        [{ to: "a@x.test", from: "b@x.test", subject: "hi", html: "<p>x</p>" }],
        Option.none(),
      );

      expect(result.error).toEqual({
        statusCode: 0,
        message: "email batch send timed out after 10ms",
      });
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("maps a successful Notify response to provider message ids", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ success: true, data: { messageId: "msg-123" } }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })) as unknown as typeof fetch;

    try {
      const result = await notifyBatchSender(
        "test-key",
        new NoOpInstrumentation(),
        logger,
      ).batchSend(
        [{ to: "a@x.test", from: "b@x.test", subject: "hi", html: "<p>x</p>" }],
        Option.none(),
      );

      expect(result.error).toBeNull();
      expect(result.data).toEqual([{ id: "msg-123" }]);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
