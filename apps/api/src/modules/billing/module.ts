import type { IInstrumentation } from "@packages/ddd-kit";
import { defineModule } from "inwire";
import type Stripe from "stripe";
import type { IPlanOverrideStore } from "../../shared/ports/plan-override.port";
import type { IStripeEventGateway, IStripeEventStore } from "../../shared/ports/stripe-event.port";
import type { BillingSettings } from "./application/config/billing-settings";
import type { IBillingPortalGateway } from "./application/ports/billing-portal.port";
import type { IStripeCatalogSource } from "./application/ports/stripe-catalog.port";
import type { ISubscriptionReadStore } from "./application/ports/subscription-read.port";
import type { ISubscriptionSyncStore } from "./application/ports/subscription-sync.port";
import { BillingCatalogService } from "./application/services/billing-catalog.service";
import { BillingPortalService } from "./application/services/billing-portal.service";
import { EntitlementsService } from "./application/services/entitlements.service";
import { StripeBillingPortalGateway } from "./infrastructure/adapters/stripe-billing-portal.gateway";
import { StripeCatalogSource } from "./infrastructure/adapters/stripe-catalog.source";
import { StripeEventGateway } from "./infrastructure/adapters/stripe-event.gateway";
import { StripeSyncVerifier } from "./infrastructure/adapters/stripe-sync-verifier";
import { DrizzlePlanOverrideStore } from "./infrastructure/repositories/drizzle-plan-override.store";
import { DrizzleStripeEventStore } from "./infrastructure/repositories/drizzle-stripe-event.store";
import { DrizzleSubscriptionReadStore } from "./infrastructure/repositories/drizzle-subscription-read.store";
import { DrizzleSubscriptionSyncStore } from "./infrastructure/repositories/drizzle-subscription-sync.store";
import { createStripeClient } from "./infrastructure/stripe-client";

export interface BillingPrerequisites {
  IInstrumentation: IInstrumentation;
  billingSettings: BillingSettings;
}

export const billingModule = defineModule<BillingPrerequisites>()((b) =>
  b
    .add("StripeClient", (c): Stripe => createStripeClient(c.billingSettings))
    .add(
      "IStripeCatalogSource",
      (c): IStripeCatalogSource => new StripeCatalogSource(c.StripeClient, c.IInstrumentation),
    )
    .add(
      "IBillingPortalGateway",
      (c): IBillingPortalGateway =>
        new StripeBillingPortalGateway(c.StripeClient, c.IInstrumentation),
    )
    .add(
      "IPlanOverrideStore",
      (c): IPlanOverrideStore => new DrizzlePlanOverrideStore(c.IInstrumentation),
    )
    .add(
      "IStripeEventStore",
      (c): IStripeEventStore => new DrizzleStripeEventStore(c.IInstrumentation),
    )
    .add(
      "IStripeEventGateway",
      (c): IStripeEventGateway =>
        new StripeEventGateway(
          c.StripeClient,
          {
            secretKey: c.billingSettings.stripeSecretKey.toUndefined(),
            webhookSecret: c.billingSettings.stripeWebhookSecret.toUndefined(),
          },
          c.IInstrumentation,
        ),
    )
    .add(
      "ISubscriptionReadStore",
      (c): ISubscriptionReadStore => new DrizzleSubscriptionReadStore(c.IInstrumentation),
    )
    .add(
      "ISubscriptionSyncStore",
      (c): ISubscriptionSyncStore => new DrizzleSubscriptionSyncStore(c.IInstrumentation),
    )
    .add(
      "BillingCatalogService",
      (c) => new BillingCatalogService(c.IStripeCatalogSource, c.IInstrumentation),
    )
    .add(
      "StripeSyncVerifier",
      (c) =>
        new StripeSyncVerifier(c.ISubscriptionSyncStore, c.IStripeEventGateway, () =>
          c.BillingCatalogService.configuredPriceIds(),
        ),
    )
    .add(
      "BillingPortalService",
      (c) => new BillingPortalService(c.ISubscriptionReadStore, c.IBillingPortalGateway),
    )
    .add(
      "EntitlementsService",
      (c) =>
        new EntitlementsService(c.ISubscriptionReadStore, c.IPlanOverrideStore, c.IInstrumentation),
    ),
);
