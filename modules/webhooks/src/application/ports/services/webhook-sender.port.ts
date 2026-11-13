import type { Option, Result } from "@packages/ddd-kit";

export interface WebhookRequest {
  url: string;
  headers: Record<string, string>;
  body: string;
}

export interface WebhookResponse {
  status: number;
  statusText: string;
  headers: Record<string, string>;
  body: Option<string>;
  readError: Option<string>;
}

export interface WebhookSendFailure {
  message: string;
}

export interface IWebhookSender {
  send(request: WebhookRequest): Promise<Result<WebhookResponse, WebhookSendFailure>>;
}
