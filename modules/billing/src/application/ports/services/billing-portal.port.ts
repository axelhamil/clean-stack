import type { Result } from "@packages/ddd-kit";
import type { BillingError } from "../repositories/subscription-read.port";

export interface IBillingPortalGateway {
  createSessionUrl(customerId: string, returnUrl: string): Promise<Result<string, BillingError>>;
}
