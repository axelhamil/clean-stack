import { stripe } from "@better-auth/stripe";
import {
  authorizeSubscriptionAction,
  subscriptionEventSource,
  subscriptionEventType,
} from "@modules/billing/application/subscription-events";
import { paymentFailureOf } from "@modules/billing/infrastructure/adapters/stripe-payment-failure";
import { ORG_ROLES } from "@packages/access-control";
import { Option } from "@packages/ddd-kit";
import { type EventType, EventTypes } from "@packages/events";
import { derivedEventId } from "@packages/outbox/event-emitter";
import { scrubText } from "@packages/sentry-scrub";
import type Stripe from "stripe";
import { di } from "../../container";
import { env } from "../../shared/env";
import { emit } from "../emit";
import { findActiveMemberRole, findOrgOwnerUserId } from "../queries";

/**
 * Stripe is the caller, so a failed invoice names no user. Bookkeeping aside, this is all
 * the platform does with a webhook on top of the plugin's own subscription sync.
 */
async function handleStripeEvent(event: Stripe.Event): Promise<void> {
  const failure = paymentFailureOf(event);
  if (failure.isNone()) return;

  const { organizationId, subscriptionId, invoiceId } = failure.unwrap();
  await emit(
    EventTypes.BILLING_PAYMENT_FAILED,
    "subscription",
    subscriptionId.unwrapOr(invoiceId),
    { organizationId, subscriptionId: subscriptionId.unwrapOr(""), invoiceId, actorUserId: null },
    organizationId,
    derivedEventId(event.id, EventTypes.BILLING_PAYMENT_FAILED),
  );
}

/** Delivery bookkeeping: a store failure is captured there and must not make Stripe retry. */
async function recordStripeDelivery(event: Stripe.Event, lastError: Option<string>): Promise<void> {
  await di.IStripeEventStore.recordDelivery({ id: event.id, type: event.type, lastError });
}

/**
 * `billing.subscription.*` for a Stripe subscription lifecycle callback. Stripe is the
 * caller, so the actor is resolved as the org owner, the one member who can have
 * started or changed the subscription.
 */
async function emitSubscriptionEvent(
  eventType: EventType,
  subscription: {
    id: string;
    referenceId: string;
    status: string;
    periodEnd?: Date | null;
    stripeSubscriptionId?: string | null;
  },
  tier: string,
  stripeEventId: string,
): Promise<void> {
  const actorUserId = await findOrgOwnerUserId(subscription.referenceId);
  await emit(
    eventType,
    "subscription",
    subscription.id,
    {
      organizationId: subscription.referenceId,
      subscriptionId: subscription.id,
      tier,
      status: subscription.status,
      actorUserId,
      currentPeriodEnd: subscription.periodEnd ?? null,
    },
    subscription.referenceId,
    derivedEventId(
      subscriptionEventSource(
        subscription.status,
        stripeEventId,
        subscription.stripeSubscriptionId,
      ),
      eventType,
    ),
  );
}

export function stripePlugin() {
  return stripe({
    stripeClient: di.StripeClient,
    stripeWebhookSecret: env.STRIPE_WEBHOOK_SECRET ?? "",
    createCustomerOnSignUp: true,
    subscription: {
      enabled: true,
      plans: async () => {
        const catalog = await di.BillingCatalogService.getCatalog();
        return catalog
          .filter((p) => p.priceId !== null)
          .map((p) => ({ name: p.tier, priceId: p.priceId as string }));
      },
      authorizeReference: async ({ user, referenceId, action }) => {
        if (referenceId === user.id) return true;

        const role = await findActiveMemberRole(user.id, referenceId);
        const orgRole = ORG_ROLES.find((candidate) => candidate === role);

        return authorizeSubscriptionAction(action, orgRole);
      },
      onSubscriptionComplete: async ({ event, subscription, plan }) => {
        await emitSubscriptionEvent(
          EventTypes.BILLING_SUBSCRIPTION_CREATED,
          subscription,
          plan.name,
          event.id,
        );
      },
      onSubscriptionCreated: async ({ event, subscription, plan }) => {
        await emitSubscriptionEvent(
          EventTypes.BILLING_SUBSCRIPTION_CREATED,
          subscription,
          plan.name,
          event.id,
        );
      },
      onSubscriptionDeleted: async ({ event, subscription }) => {
        await emitSubscriptionEvent(
          EventTypes.BILLING_SUBSCRIPTION_CANCELLED,
          subscription,
          subscription.plan,
          event.id,
        );
      },
      onSubscriptionUpdate: async ({ event, subscription }) => {
        await emitSubscriptionEvent(
          subscriptionEventType(subscription.status),
          subscription,
          subscription.plan,
          event.id,
        );
      },
    },
    onEvent: async (event) => {
      try {
        await handleStripeEvent(event);
      } catch (err) {
        await recordStripeDelivery(event, Option.some(scrubText(String(err))));
        throw err;
      }

      await recordStripeDelivery(event, await di.StripeSyncVerifier.check(event));
    },
  });
}
