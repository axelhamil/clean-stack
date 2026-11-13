import { type IInstrumentation, Result } from "@packages/ddd-kit";
import type {
  IStripeEventStore,
  StripeEventStoreError,
} from "../../application/ports/repositories/stripe-event.port";
import type {
  IListStripeEventsQuery,
  StripeEventList,
} from "../../application/queries/list-stripe-events.query";

export const STRIPE_EVENTS_PAGE = 100;

export class StripeEventListQuery implements IListStripeEventsQuery {
  constructor(
    private readonly stripeEvents: IStripeEventStore,
    private readonly gateway: { isConfigured(): boolean },
    private readonly instrumentation: IInstrumentation,
  ) {}

  execute(): Promise<Result<StripeEventList, StripeEventStoreError>> {
    return this.instrumentation.startSpan({ name: "StripeEventListQuery > execute" }, async () => {
      const items = await this.stripeEvents.list(STRIPE_EVENTS_PAGE);
      if (items.isFailure) return Result.fail(items.getError());

      return Result.ok({ configured: this.gateway.isConfigured(), items: items.getValue() });
    });
  }
}
