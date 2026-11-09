import type { Option } from "@packages/ddd-kit";

export interface BillingSettings {
  stripeSecretKey: Option<string>;
  stripeWebhookSecret: Option<string>;
}
