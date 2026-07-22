import { defineModule } from "inwire";
import type { IStripeCatalogSource } from "./application/ports/stripe-catalog.port";
import type { ISubscriptionReadStore } from "./application/ports/subscription-read.port";
import { BillingCatalogService } from "./application/services/billing-catalog.service";
import { EntitlementsService } from "./application/services/entitlements.service";
import { StripeCatalogSource } from "./infrastructure/adapters/stripe-catalog.source";
import { DrizzleSubscriptionReadStore } from "./infrastructure/repositories/drizzle-subscription-read.store";
import { stripeClient } from "./infrastructure/stripe-client";

declare module "inwire" {
  interface AppDeps {
    IStripeCatalogSource: IStripeCatalogSource;
    ISubscriptionReadStore: ISubscriptionReadStore;
    BillingCatalogService: BillingCatalogService;
    EntitlementsService: EntitlementsService;
  }
}

export const billingModule = defineModule()((b) =>
  b
    .add("IStripeCatalogSource", (c) => new StripeCatalogSource(stripeClient, c.IInstrumentation))
    .add("ISubscriptionReadStore", (c) => new DrizzleSubscriptionReadStore(c.IInstrumentation))
    .add(
      "BillingCatalogService",
      (c) => new BillingCatalogService(c.IStripeCatalogSource, c.IInstrumentation),
    )
    .add(
      "EntitlementsService",
      (c) => new EntitlementsService(c.ISubscriptionReadStore, c.IInstrumentation),
    ),
);
