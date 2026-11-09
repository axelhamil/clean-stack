import type { Option } from "@packages/ddd-kit";

export const WEBHOOK_DNS_TIMEOUT_SECONDS = 5;
export const WEBHOOK_FETCH_TIMEOUT_SECONDS = 30;
export const WEBHOOK_SETTLE_MARGIN_SECONDS = 30;

export interface WebhookDeliverySettings {
  leaseSeconds: number;
  deadRetrySeconds: number;
  autoDisableMinFailures: number;
  autoDisableAfterDays: number;
  responseCaptureBytes: number;
  httpsOnly: boolean;
}

export interface WebhookSettings {
  masterKeyHex: Option<string>;
  secretGraceHours: number;
  delivery: WebhookDeliverySettings;
}
