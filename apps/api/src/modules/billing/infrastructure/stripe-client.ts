import Stripe from "stripe";
import type { BillingSettings } from "../application/config/billing-settings";

export function createStripeClient(settings: BillingSettings): Stripe {
  return new Stripe(settings.stripeSecretKey.unwrapOr("sk_test_placeholder"), {
    apiVersion: "2026-09-30.endive",
  });
}
