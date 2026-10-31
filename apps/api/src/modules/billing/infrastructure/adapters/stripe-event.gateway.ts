import { Result } from "@packages/ddd-kit";
import type Stripe from "stripe";
import type { IInstrumentation } from "../../../../shared/ports/instrumentation.port";
import type {
  IStripeEventGateway,
  StripeEventCopy,
  StripeGatewayError,
  StripeWebhookHandler,
} from "../../../../shared/ports/stripe-event.port";

export interface StripeEventsClient {
  events: { retrieve(id: string): Promise<Stripe.Event> };
  subscriptions: { retrieve(id: string): Promise<Stripe.Subscription> };
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
  return Result.fail({ code: "ADMIN_STRIPE_PROVIDER_FAILURE", message });
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

  async retrieve(id: string): Promise<Result<StripeEventCopy, StripeGatewayError>> {
    return this.instrumentation.startSpan({ name: "StripeEventGateway > retrieve" }, async () => {
      try {
        const event = await this.instrumentation.startSpan(
          { name: "events.retrieve", op: "http.client" },
          () => this.stripe.events.retrieve(id),
        );
        const current = await this.withCurrentSubscription(event);

        return Result.ok({ payload: JSON.stringify(current) });
      } catch (err) {
        this.instrumentation.capture(err);
        return failure("Stripe did not return this event.");
      }
    });
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

  private async withCurrentSubscription(event: Stripe.Event): Promise<Stripe.Event> {
    if (
      event.type !== "customer.subscription.created" &&
      event.type !== "customer.subscription.updated" &&
      event.type !== "customer.subscription.deleted"
    ) {
      return event;
    }

    const object = await this.instrumentation.startSpan(
      { name: "subscriptions.retrieve", op: "http.client" },
      () => this.stripe.subscriptions.retrieve(event.data.object.id),
    );

    return { ...event, data: { ...event.data, object } };
  }
}
