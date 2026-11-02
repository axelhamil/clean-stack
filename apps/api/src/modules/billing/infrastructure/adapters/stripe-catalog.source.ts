import { Option } from "@packages/ddd-kit";
import type Stripe from "stripe";
import type { IInstrumentation } from "../../../../shared/ports/instrumentation.port";
import type {
  IStripeCatalogSource,
  StripePriceLite,
} from "../../application/ports/stripe-catalog.port";

export class StripeCatalogSource implements IStripeCatalogSource {
  constructor(
    private readonly stripe: Stripe,
    private readonly instrumentation: IInstrumentation,
  ) {}

  async listActivePrices(): Promise<StripePriceLite[]> {
    return this.instrumentation.startSpan<StripePriceLite[]>(
      { name: "StripeCatalogSource > listActivePrices" },
      async () => {
        try {
          const res = await this.instrumentation.startSpan(
            { name: "stripe.prices.list", op: "http.client" },
            () => this.stripe.prices.list({ active: true, expand: ["data.product"] }),
          );

          return res.data.flatMap((price): StripePriceLite[] => {
            const product = price.product as Stripe.Product;
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
        } catch (err) {
          this.instrumentation.capture(err);
          throw err;
        }
      },
    );
  }
}
