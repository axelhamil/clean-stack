import { type AppError, Result } from "@packages/ddd-kit";
import type { IBillingPortalGateway } from "../ports/billing-portal.port";
import type { BillingError, ISubscriptionReadStore } from "../ports/subscription-read.port";

export type BillingPortalError = BillingError | AppError<"BILLING_NOT_FOUND">;

export class BillingPortalService {
  constructor(
    private readonly store: ISubscriptionReadStore,
    private readonly gateway: IBillingPortalGateway,
  ) {}

  async openPortal(orgId: string, returnUrl: string): Promise<Result<string, BillingPortalError>> {
    const customerResult = await this.store.findCustomerIdByReference(orgId);
    if (customerResult.isFailure) {
      return Result.fail({
        code: "BILLING_PROVIDER_FAILURE",
        message: "Failed to retrieve subscription data.",
      });
    }

    const customer = customerResult.getValue();
    if (customer.isNone()) {
      return Result.fail({ code: "BILLING_NOT_FOUND", message: "No paid subscription to manage." });
    }

    const url = await this.gateway.createSessionUrl(customer.unwrap(), returnUrl);

    return Result.ok(url);
  }
}
