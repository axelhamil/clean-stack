export interface AuthRequestHandler {
  handle(request: Request): Promise<Response>;
}

export type StripeWebhookHandler = (request: Request) => Promise<Response>;
