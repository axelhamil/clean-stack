import { type IInstrumentation, Option, Result } from "@packages/ddd-kit";
import type Stripe from "stripe";
import type {
  IStripeCatalogSource,
  StripePriceLite,
} from "../../application/ports/stripe-catalog.port";
import type { BillingError } from "../../application/ports/subscription-read.port";

function isLiveProduct(product: Stripe.Price["product"]): product is Stripe.Product {
  return typeof product === "object" && !("deleted" in product && product.deleted === true);
}

export class StripeCatalogSource implements IStripeCatalogSource {
  constructor(
    private readonly stripe: Stripe,
    private readonly instrumentation: IInstrumentation,
  ) {}

  async listActivePrices(): Promise<Result<StripePriceLite[], BillingError>> {
    return this.instrumentation.startSpan<Result<StripePriceLite[], BillingError>>(
      { name: "StripeCatalogSource > listActivePrices" },
      async () => {
        try {
          const res = await this.instrumentation.startSpan(
            { name: "stripe.prices.list", op: "http.client" },
            () => this.stripe.prices.list({ active: true, expand: ["data.product"] }),
          );

          const prices = res.data.flatMap((price): StripePriceLite[] => {
            const product = price.product;
            if (!isLiveProduct(product)) return [];

            const tier = product.metadata?.tier;
            if (!tier) return [];

            return [
              {
                priceId: price.id,
                tier,
                unitAmount: price.unit_amount ?? 0,
                currency: price.currency,
                interval: Option.fromNullable(price.recurring?.interval),
                productName: product.name,
                marketingFeatures: (product.marketing_features ?? [])
                  .map((f) => f.name)
                  .filter((n): n is string => Boolean(n)),
              },
            ];
          });

          return Result.ok(prices);
        } catch (err) {
          this.instrumentation.capture(err);
          return Result.fail({
            code: "BILLING_PROVIDER_FAILURE",
            message: "The plan catalog could not be loaded.",
          });
        }
      },
    );
  }
}
