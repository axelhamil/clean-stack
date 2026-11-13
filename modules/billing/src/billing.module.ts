import type { IInstrumentation } from "@packages/ddd-kit";
import { defineModule } from "inwire";
import type Stripe from "stripe";
import type { BillingSettings } from "./application/config/billing-settings";
import type { IPlanOverrideStore } from "./application/ports/repositories/plan-override.port";
import type { IStripeEventStore } from "./application/ports/repositories/stripe-event.port";
import type { ISubscriptionReadStore } from "./application/ports/repositories/subscription-read.port";
import type { ISubscriptionSyncStore } from "./application/ports/repositories/subscription-sync.port";
import type { IBillingPortalGateway } from "./application/ports/services/billing-portal.port";
import type { IStripeCatalogSource } from "./application/ports/services/stripe-catalog.port";
import type { IStripeEventGateway } from "./application/ports/services/stripe-event-gateway.port";
import type { IGetEntitlementsQuery } from "./application/queries/get-entitlements.query";
import type { IGetPlanCatalogQuery } from "./application/queries/get-plan-catalog.query";
import type { IListConfiguredPriceIdsQuery } from "./application/queries/list-configured-price-ids.query";
import type { IReadEntitlementsQuery } from "./application/queries/read-entitlements.query";
import { OpenBillingPortalUseCase } from "./application/usecases/open-billing-portal/open-billing-portal.usecase";
import { VerifyStripeSyncUseCase } from "./application/usecases/verify-stripe-sync/verify-stripe-sync.usecase";
import { StripeBillingPortalGateway } from "./infra/adapters/stripe-billing-portal.adapter";
import { StripeCatalogSource } from "./infra/adapters/stripe-catalog.adapter";
import { createStripeClient } from "./infra/adapters/stripe-client.adapter";
import { StripeEventGateway } from "./infra/adapters/stripe-event-gateway.adapter";
import { CachedPlanCatalogQuery } from "./infra/queries/cached-plan-catalog.query";
import { CatalogConfiguredPriceIdsQuery } from "./infra/queries/configured-price-ids.query";
import { FailClosedEntitlementsQuery } from "./infra/queries/get-entitlements.query";
import { StripePlanCatalogQuery } from "./infra/queries/plan-catalog.query";
import { StrictEntitlementsQuery } from "./infra/queries/read-entitlements.query";
import { DrizzlePlanOverrideRepository } from "./infra/repos/drizzle/plan-override.repository";
import { DrizzleStripeEventRepository } from "./infra/repos/drizzle/stripe-event.repository";
import { DrizzleSubscriptionReadRepository } from "./infra/repos/drizzle/subscription-read.repository";
import { DrizzleSubscriptionSyncRepository } from "./infra/repos/drizzle/subscription-sync.repository";

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
      (c): IPlanOverrideStore => new DrizzlePlanOverrideRepository(c.IInstrumentation),
    )
    .add(
      "IStripeEventStore",
      (c): IStripeEventStore => new DrizzleStripeEventRepository(c.IInstrumentation),
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
      (c): ISubscriptionReadStore => new DrizzleSubscriptionReadRepository(c.IInstrumentation),
    )
    .add(
      "ISubscriptionSyncStore",
      (c): ISubscriptionSyncStore => new DrizzleSubscriptionSyncRepository(c.IInstrumentation),
    )
    .add(
      "IGetPlanCatalogQuery",
      (c): IGetPlanCatalogQuery =>
        new CachedPlanCatalogQuery(
          new StripePlanCatalogQuery(c.IStripeCatalogSource),
          c.IInstrumentation,
        ),
    )
    .add(
      "IListConfiguredPriceIdsQuery",
      (c): IListConfiguredPriceIdsQuery =>
        new CatalogConfiguredPriceIdsQuery(c.IGetPlanCatalogQuery),
    )
    .add(
      "IGetEntitlementsQuery",
      (c): IGetEntitlementsQuery =>
        new FailClosedEntitlementsQuery(
          c.ISubscriptionReadStore,
          c.IPlanOverrideStore,
          c.IInstrumentation,
        ),
    )
    .add(
      "IReadEntitlementsQuery",
      (c): IReadEntitlementsQuery =>
        new StrictEntitlementsQuery(
          c.ISubscriptionReadStore,
          c.IPlanOverrideStore,
          c.IInstrumentation,
        ),
    )
    .add(
      "OpenBillingPortalUseCase",
      (c) => new OpenBillingPortalUseCase(c.ISubscriptionReadStore, c.IBillingPortalGateway),
    )
    .add(
      "VerifyStripeSyncUseCase",
      (c) =>
        new VerifyStripeSyncUseCase(
          c.ISubscriptionSyncStore,
          c.IStripeEventGateway,
          c.IListConfiguredPriceIdsQuery,
        ),
    ),
);
