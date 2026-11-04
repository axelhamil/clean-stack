import type { Option } from "@packages/ddd-kit";
import { EMAIL_SEND_TIMEOUT_SECONDS } from "../env-bounds";
import type { Logger } from "../logger";
import type { IInstrumentation } from "../ports/instrumentation.port";
import type { BatchEntry, BatchResult, BatchSender } from "./email-delivery-worker.service";

const NOTIFY_SEND_URL = "https://notify.cx/api/email/send";

type NotifySendBody = {
  to: string;
  from: string;
  subject: string;
  html: string;
};

type EntrySendResult =
  | { ok: true; messageId: string }
  | { ok: false; statusCode: number; message: string };

type ParsedEntry = { body: NotifySendBody } | EntrySendResult;

function notifyBodyFromEntry(entry: BatchEntry): ParsedEntry {
  if ("template" in entry && entry.template) {
    return {
      ok: false,
      statusCode: 0,
      message: "Notify does not support dashboard template IDs; keep TEMPLATE_IDS empty",
    };
  }

  const to = typeof entry.to === "string" ? entry.to : "";
  const from = typeof entry.from === "string" ? entry.from : "";
  const subject = typeof entry.subject === "string" ? entry.subject : "";
  const html =
    (typeof entry.html === "string" && entry.html.length > 0 ? entry.html : undefined) ??
    (typeof entry.text === "string" && entry.text.length > 0 ? entry.text : undefined) ??
    "";

  if (!to || !from || !subject || !html) {
    return {
      ok: false,
      statusCode: 0,
      message: "missing required email fields (to, from, subject, body)",
    };
  }

  return { body: { to, from, subject, html } };
}

async function sendOne(
  apiKey: string,
  body: NotifySendBody,
  signal: AbortSignal,
  instrumentation: IInstrumentation,
): Promise<EntrySendResult> {
  return instrumentation.startSpan(
    {
      name: "POST https://notify.cx/api/email/send",
      op: "http.client",
      attributes: {
        "http.method": "POST",
        "http.host": "notify.cx",
      },
    },
    async () => {
      try {
        const response = await fetch(NOTIFY_SEND_URL, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-api-key": apiKey,
          },
          body: JSON.stringify(body),
          signal,
        });

        const responseBody: unknown = await response.json().catch(() => null);

        if (!response.ok) {
          const message =
            responseBody &&
            typeof responseBody === "object" &&
            "error" in responseBody &&
            typeof responseBody.error === "string"
              ? responseBody.error
              : `Notify request failed (${response.status})`;
          if (response.status >= 500) {
            instrumentation.capture(new Error(message));
          }
          return { ok: false, statusCode: response.status, message };
        }

        const messageId =
          responseBody &&
          typeof responseBody === "object" &&
          "data" in responseBody &&
          responseBody.data &&
          typeof responseBody.data === "object" &&
          "messageId" in responseBody.data &&
          typeof responseBody.data.messageId === "string"
            ? responseBody.data.messageId
            : "notify-sent";

        return { ok: true, messageId };
      } catch (err) {
        instrumentation.capture(err);
        if (signal.aborted) {
          return { ok: false, statusCode: 0, message: "aborted" };
        }
        return {
          ok: false,
          statusCode: 0,
          message: err instanceof Error ? err.message : "network error",
        };
      }
    },
  );
}

export function notifyBatchSender(
  apiKey: string | null,
  instrumentation: IInstrumentation,
  logger: Logger,
  timeoutMs: number = EMAIL_SEND_TIMEOUT_SECONDS * 1000,
): BatchSender {
  const timedOut = { statusCode: 0, message: `email batch send timed out after ${timeoutMs}ms` };

  return {
    async batchSend(entries: BatchEntry[], _idempotencyKey: Option<string>): Promise<BatchResult> {
      if (!apiKey) {
        for (const e of entries) {
          logger.info(
            { to: e.to, subject: e.subject },
            "[email-dev] not delivered: no NOTIFY_API_KEY",
          );
        }
        return { data: entries.map((_, i) => ({ id: `dev-${i}` })), error: null };
      }

      const signal = AbortSignal.timeout(timeoutMs);

      return instrumentation.startSpan(
        {
          name: "NotifyBatchSender > batchSend",
          op: "http.client",
          attributes: { "email.count": entries.length },
        },
        async () => {
          const results: EntrySendResult[] = [];

          for (const entry of entries) {
            if (signal.aborted) {
              return { data: null, error: timedOut };
            }

            const parsed = notifyBodyFromEntry(entry);
            if ("body" in parsed) {
              results.push(await sendOne(apiKey, parsed.body, signal, instrumentation));
            } else {
              results.push(parsed);
            }
          }

          if (signal.aborted) {
            instrumentation.capture(new Error(timedOut.message));
            return { data: null, error: timedOut };
          }

          const errors: Array<{ index: number; message: string }> = [];
          const data: Array<{ id: string }> = [];

          for (const [index, result] of results.entries()) {
            if (result.ok) {
              data.push({ id: result.messageId });
            } else {
              errors.push({ index, message: `HTTP ${result.statusCode}: ${result.message}` });
              data.push({ id: "" });
            }
          }

          return { data, errors: errors.length > 0 ? errors : undefined, error: null };
        },
      );
    },
  };
}
