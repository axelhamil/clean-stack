import { Option } from "@packages/ddd-kit";
import type Stripe from "stripe";

export interface PaymentFailure {
  organizationId: string;
  subscriptionId: Option<string>;
  invoiceId: string;
}

export function paymentFailureOf(event: Stripe.Event): Option<PaymentFailure> {
  if (event.type !== "invoice.payment_failed") return Option.none();

  const invoice = event.data.object;
  if (invoice.status === "paid") return Option.none();

  const details = invoice.parent?.subscription_details;
  const organizationId = details?.metadata?.referenceId;
  if (!organizationId) return Option.none();

  return Option.some({
    organizationId,
    subscriptionId: Option.fromNullable(
      typeof details?.subscription === "string" ? details.subscription : null,
    ),
    invoiceId: invoice.id,
  });
}
