import { type IInstrumentation, Result } from "@packages/ddd-kit";
import type Stripe from "stripe";
import type { BillingError } from "../../application/ports/repositories/subscription-read.port";
import type { IBillingPortalGateway } from "../../application/ports/services/billing-portal.port";

export class StripeBillingPortalGateway implements IBillingPortalGateway {
  constructor(
    private readonly stripe: Stripe,
    private readonly instrumentation: IInstrumentation,
  ) {}

  async createSessionUrl(
    customerId: string,
    returnUrl: string,
  ): Promise<Result<string, BillingError>> {
    return this.instrumentation.startSpan(
      { name: "StripeBillingPortalGateway > createSessionUrl" },
      async () => {
        try {
          const session = await this.instrumentation.startSpan(
            { name: "billingPortal.sessions.create", op: "http.client" },
            () =>
              this.stripe.billingPortal.sessions.create({
                customer: customerId,
                return_url: returnUrl,
              }),
          );

          return Result.ok(session.url);
        } catch (err) {
          this.instrumentation.capture(err);
          return Result.fail({
            code: "BILLING_PROVIDER_FAILURE",
            message: "The billing portal could not be opened, try again in a moment.",
          });
        }
      },
    );
  }
}
