import { type IInstrumentation, Result } from "@packages/ddd-kit";
import type Stripe from "stripe";
import type {
  IStripeEventGateway,
  StripeEventCopy,
  StripeEventRetrieveError,
  StripeGatewayError,
  StripeSubscriptionState,
  StripeWebhookHandler,
} from "../../application/ports/services/stripe-event-gateway.port";

export interface StripeEventsClient {
  events: { retrieve(id: string): Promise<Stripe.Event> };
  subscriptions: { retrieve(id: string): Promise<Stripe.Subscription> };
  invoices: { retrieve(id: string): Promise<Stripe.Invoice> };
  webhooks: {
    generateTestHeaderStringAsync(options: { payload: string; secret: string }): Promise<string>;
  };
}

export interface StripeSecrets {
  secretKey: string | undefined;
  webhookSecret: string | undefined;
}

const WEBHOOK_URL = "http://localhost/api/auth/stripe/webhook";

function failure(message: string): Result<never, StripeGatewayError> {
  return Result.fail({ code: "STRIPE_PROVIDER_FAILURE", message });
}

function isNotFoundAtStripe(err: unknown): boolean {
  return err instanceof Error && "statusCode" in err && err.statusCode === 404;
}

export class StripeEventGateway implements IStripeEventGateway {
  constructor(
    private readonly stripe: StripeEventsClient,
    private readonly secrets: StripeSecrets,
    private readonly instrumentation: IInstrumentation,
  ) {}

  isConfigured(): boolean {
    return Boolean(this.secrets.secretKey && this.secrets.webhookSecret);
  }

  async retrieve(id: string): Promise<Result<StripeEventCopy, StripeEventRetrieveError>> {
    return this.instrumentation.startSpan({ name: "StripeEventGateway > retrieve" }, async () => {
      try {
        const event = await this.instrumentation.startSpan(
          { name: "events.retrieve", op: "http.client" },
          () => this.stripe.events.retrieve(id),
        );
        const current = await this.withCurrentObject(event);

        return Result.ok({ payload: JSON.stringify(current) });
      } catch (err) {
        this.instrumentation.capture(err);
        if (!isNotFoundAtStripe(err)) return failure("Stripe did not return this event.");

        return Result.fail({
          code: "STRIPE_EVENT_EXPIRED_NOT_FOUND",
          message:
            "Stripe no longer holds this event, it keeps them 30 days. Resend it from the Stripe dashboard if needed.",
        });
      }
    });
  }

  async currentSubscription(
    id: string,
  ): Promise<Result<StripeSubscriptionState, StripeGatewayError>> {
    return this.instrumentation.startSpan(
      { name: "StripeEventGateway > currentSubscription" },
      async () => {
        try {
          const { status, cancel_at_period_end } = await this.instrumentation.startSpan(
            { name: "subscriptions.retrieve", op: "http.client" },
            () => this.stripe.subscriptions.retrieve(id),
          );

          return Result.ok({ status, cancelAtPeriodEnd: cancel_at_period_end });
        } catch (err) {
          this.instrumentation.capture(err);
          return failure("Stripe did not return this subscription.");
        }
      },
    );
  }

  async redeliver(
    { payload }: StripeEventCopy,
    handler: StripeWebhookHandler,
  ): Promise<Result<void, StripeGatewayError>> {
    return this.instrumentation.startSpan({ name: "StripeEventGateway > redeliver" }, async () => {
      try {
        const signature = await this.stripe.webhooks.generateTestHeaderStringAsync({
          payload,
          secret: this.secrets.webhookSecret ?? "",
        });
        const response = await handler(
          new Request(WEBHOOK_URL, {
            method: "POST",
            headers: { "content-type": "application/json", "stripe-signature": signature },
            body: payload,
          }),
        );

        return response.ok ? Result.ok() : failure(`The handler answered ${response.status}.`);
      } catch (err) {
        this.instrumentation.capture(err);
        return failure("The handler could not run.");
      }
    });
  }

  private async withCurrentObject(event: Stripe.Event): Promise<Stripe.Event> {
    switch (event.type) {
      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted": {
        const object = await this.instrumentation.startSpan(
          { name: "subscriptions.retrieve", op: "http.client" },
          () => this.stripe.subscriptions.retrieve(event.data.object.id),
        );

        return { ...event, data: { ...event.data, object } };
      }
      case "invoice.payment_failed": {
        const object = await this.instrumentation.startSpan(
          { name: "invoices.retrieve", op: "http.client" },
          () => this.stripe.invoices.retrieve(event.data.object.id),
        );

        return { ...event, data: { ...event.data, object } };
      }
      default:
        return event;
    }
  }
}
