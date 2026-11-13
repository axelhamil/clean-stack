import { type IUseCase, Result } from "@packages/ddd-kit";
import type { ISubscriptionReadStore } from "../../ports/repositories/subscription-read.port";
import type { IBillingPortalGateway } from "../../ports/services/billing-portal.port";
import type {
  BillingPortalError,
  OpenBillingPortalInput,
  OpenBillingPortalOutput,
} from "./open-billing-portal.dto";

export class OpenBillingPortalUseCase
  implements IUseCase<OpenBillingPortalInput, OpenBillingPortalOutput, BillingPortalError>
{
  constructor(
    private readonly subscriptions: ISubscriptionReadStore,
    private readonly gateway: IBillingPortalGateway,
  ) {}

  async execute({
    organizationId,
    returnUrl,
  }: OpenBillingPortalInput): Promise<Result<OpenBillingPortalOutput, BillingPortalError>> {
    const customerResult = await this.subscriptions.findCustomerIdByReference(organizationId);
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

    const session = await this.gateway.createSessionUrl(customer.unwrap(), returnUrl);
    if (session.isFailure) return Result.fail(session.getError());

    return Result.ok({ url: session.getValue() });
  }
}
