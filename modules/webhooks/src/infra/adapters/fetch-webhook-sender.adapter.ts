import { type IInstrumentation, Option, Result } from "@packages/ddd-kit";
import { WEBHOOK_FETCH_TIMEOUT_SECONDS } from "../../application/config/webhook-settings";
import type {
  IWebhookSender,
  WebhookRequest,
  WebhookResponse,
  WebhookSendFailure,
} from "../../application/ports/services/webhook-sender.port";
import { errorText } from "../../application/services/delivery-policy.service";

const FETCH_TIMEOUT_MS = WEBHOOK_FETCH_TIMEOUT_SECONDS * 1000;

async function readCappedBody(res: Response, cap: number): Promise<string | null> {
  if (!res.body) return null;
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (total < cap) {
      const { done, value } = await reader.read();
      if (done || !value) break;
      chunks.push(value);
      total += value.length;
    }
  } finally {
    reader.cancel().catch(() => {});
  }
  const buf = new Uint8Array(Math.min(total, cap));
  let offset = 0;
  for (const chunk of chunks) {
    const remaining = cap - offset;
    if (remaining <= 0) break;
    buf.set(chunk.subarray(0, Math.min(chunk.length, remaining)), offset);
    offset += Math.min(chunk.length, remaining);
  }
  return new TextDecoder().decode(buf);
}

export class FetchWebhookSender implements IWebhookSender {
  constructor(
    private readonly instrumentation: IInstrumentation,
    private readonly responseCaptureBytes: number,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async send(request: WebhookRequest): Promise<Result<WebhookResponse, WebhookSendFailure>> {
    const ctrl = new AbortController();
    const timeoutHandle = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
    try {
      const res = await this.instrumentation.startSpan(
        {
          name: `POST ${request.url}`,
          op: "http.client",
          attributes: { "http.method": "POST" },
        },
        () =>
          this.fetchImpl(request.url, {
            method: "POST",
            headers: request.headers,
            body: request.body,
            redirect: "manual",
            signal: ctrl.signal,
          }),
      );
      const headers: Record<string, string> = {};
      res.headers.forEach((value, key) => {
        headers[key] = value;
      });
      const read = await readCappedBody(res, this.responseCaptureBytes).then(
        (text) => ({ body: Option.fromNullable(text), readError: Option.none<string>() }),
        (err) => {
          this.instrumentation.capture(err);
          return { body: Option.none<string>(), readError: Option.some(errorText(err)) };
        },
      );

      return Result.ok({ status: res.status, statusText: res.statusText, headers, ...read });
    } catch (err) {
      this.instrumentation.capture(err);
      return Result.fail({ message: errorText(err) });
    } finally {
      clearTimeout(timeoutHandle);
    }
  }
}
