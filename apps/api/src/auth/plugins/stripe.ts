import { stripe } from "@better-auth/stripe";
import type { IStripeEventStore } from "@modules/billing/application/ports/stripe-event.port";
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
import type { AuthDeps } from "../deps";
import type { Emit } from "../emit";
import type { AuthHelpers } from "../helpers";
import { findActiveMemberRole, findOrgOwnerUserId } from "../queries";

/**
 * Stripe is the caller, so a failed invoice names no user. Bookkeeping aside, this is all
 * the platform does with a webhook on top of the plugin's own subscription sync.
 */
async function handleStripeEvent(emit: Emit, event: Stripe.Event): Promise<void> {
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
async function recordStripeDelivery(
  stripeEvents: IStripeEventStore,
  event: Stripe.Event,
  lastError: Option<string>,
): Promise<void> {
  await stripeEvents.recordDelivery({ id: event.id, type: event.type, lastError });
}

/**
 * `billing.subscription.*` for a Stripe subscription lifecycle callback. Stripe is the
 * caller, so the actor is resolved as the org owner, the one member who can have
 * started or changed the subscription.
 */
async function emitSubscriptionEvent(
  emit: Emit,
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

export function stripePlugin(
  deps: Pick<AuthDeps, "stripeClient" | "stripeEvents" | "plans" | "stripeSync" | "settings">,
  helpers: Pick<AuthHelpers, "emit">,
) {
  const { emit } = helpers;

  return stripe({
    stripeClient: deps.stripeClient,
    stripeWebhookSecret: deps.settings.stripeWebhookSecret,
    createCustomerOnSignUp: true,
    subscription: {
      enabled: true,
      plans: async () => {
        const catalog = await deps.plans.getCatalog();
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
          emit,
          EventTypes.BILLING_SUBSCRIPTION_CREATED,
          subscription,
          plan.name,
          event.id,
        );
      },
      onSubscriptionCreated: async ({ event, subscription, plan }) => {
        await emitSubscriptionEvent(
          emit,
          EventTypes.BILLING_SUBSCRIPTION_CREATED,
          subscription,
          plan.name,
          event.id,
        );
      },
      onSubscriptionDeleted: async ({ event, subscription }) => {
        await emitSubscriptionEvent(
          emit,
          EventTypes.BILLING_SUBSCRIPTION_CANCELLED,
          subscription,
          subscription.plan,
          event.id,
        );
      },
      onSubscriptionUpdate: async ({ event, subscription }) => {
        await emitSubscriptionEvent(
          emit,
          subscriptionEventType(subscription.status),
          subscription,
          subscription.plan,
          event.id,
        );
      },
    },
    onEvent: async (event) => {
      try {
        await handleStripeEvent(emit, event);
      } catch (err) {
        await recordStripeDelivery(deps.stripeEvents, event, Option.some(scrubText(String(err))));
        throw err;
      }

      await recordStripeDelivery(deps.stripeEvents, event, await deps.stripeSync.check(event));
    },
  });
}
