import { defineModule } from "inwire";
import type { IBillingPortalGateway } from "./application/ports/billing-portal.port";
import type { IStripeCatalogSource } from "./application/ports/stripe-catalog.port";
import type { ISubscriptionReadStore } from "./application/ports/subscription-read.port";
import { BillingCatalogService } from "./application/services/billing-catalog.service";
import { BillingPortalService } from "./application/services/billing-portal.service";
import { EntitlementsService } from "./application/services/entitlements.service";
import { StripeBillingPortalGateway } from "./infrastructure/adapters/stripe-billing-portal.gateway";
import { StripeCatalogSource } from "./infrastructure/adapters/stripe-catalog.source";
import { DrizzleSubscriptionReadStore } from "./infrastructure/repositories/drizzle-subscription-read.store";
import { stripeClient } from "./infrastructure/stripe-client";

declare module "inwire" {
  interface AppDeps {
    IStripeCatalogSource: IStripeCatalogSource;
    IBillingPortalGateway: IBillingPortalGateway;
    ISubscriptionReadStore: ISubscriptionReadStore;
    BillingCatalogService: BillingCatalogService;
    BillingPortalService: BillingPortalService;
    EntitlementsService: EntitlementsService;
  }
}

export const billingModule = defineModule()((b) =>
  b
    .add("IStripeCatalogSource", (c) => new StripeCatalogSource(stripeClient, c.IInstrumentation))
    .add(
      "IBillingPortalGateway",
      (c) => new StripeBillingPortalGateway(stripeClient, c.IInstrumentation),
    )
    .add("ISubscriptionReadStore", (c) => new DrizzleSubscriptionReadStore(c.IInstrumentation))
    .add(
      "BillingCatalogService",
      (c) => new BillingCatalogService(c.IStripeCatalogSource, c.IInstrumentation),
    )
    .add(
      "BillingPortalService",
      (c) => new BillingPortalService(c.ISubscriptionReadStore, c.IBillingPortalGateway),
    )
    .add(
      "EntitlementsService",
      (c) => new EntitlementsService(c.ISubscriptionReadStore, c.IInstrumentation),
    ),
);
