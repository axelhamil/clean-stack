export interface ReplayStripeEventInput<Handler> {
  actorUserId: string;
  stripeEventId: string;
  handler: Handler;
}
