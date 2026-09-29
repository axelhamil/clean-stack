export interface IBillingPortalGateway {
  createSessionUrl(customerId: string, returnUrl: string): Promise<string>;
}
