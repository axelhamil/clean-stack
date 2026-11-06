import type { Option } from "@packages/ddd-kit";

export interface WebhookDeliverySettings {
  leaseSeconds: number;
  deadRetrySeconds: number;
  autoDisableMinFailures: number;
  autoDisableAfterDays: number;
  responseCaptureBytes: number;
}

export interface WebhookSettings {
  masterKeyHex: Option<string>;
  secretGraceHours: number;
  delivery: WebhookDeliverySettings;
}
