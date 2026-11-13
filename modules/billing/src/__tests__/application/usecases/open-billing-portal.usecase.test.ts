import { describe, expect, it } from "bun:test";
import { Option, Result } from "@packages/ddd-kit";
import { mockPort } from "@packages/test/bun";
import type {
  BillingError,
  ISubscriptionReadStore,
} from "../../../application/ports/repositories/subscription-read.port";
import type { IBillingPortalGateway } from "../../../application/ports/services/billing-portal.port";
import { OpenBillingPortalUseCase } from "../../../application/usecases/open-billing-portal/open-billing-portal.usecase";

const RETURN_URL = "https://app.test/settings/billing";

function setup(customer: Result<Option<string>, BillingError>) {
  const subscriptions = mockPort<ISubscriptionReadStore>();
  subscriptions.findCustomerIdByReference.mockResolvedValue(customer);

  const gateway = mockPort<IBillingPortalGateway>();
  gateway.createSessionUrl.mockResolvedValue(Result.ok("https://billing.stripe.test/session"));

  return { gateway, useCase: new OpenBillingPortalUseCase(subscriptions, gateway) };
}

describe("OpenBillingPortalUseCase", () => {
  it("given a Stripe customer, when the portal opens, then it returns the session for that customer", async () => {
    const { useCase, gateway } = setup(Result.ok(Option.some("cus_1")));

    const result = await useCase.execute({ organizationId: "org1", returnUrl: RETURN_URL });

    expect(result.getValue()).toEqual({ url: "https://billing.stripe.test/session" });
    expect(gateway.createSessionUrl).toHaveBeenCalledWith("cus_1", RETURN_URL);
  });

  it("given no paid subscription, when the portal opens, then it fails with BILLING_NOT_FOUND", async () => {
    const { useCase, gateway } = setup(Result.ok(Option.none()));

    const result = await useCase.execute({ organizationId: "org1", returnUrl: RETURN_URL });

    expect(result.getError().code).toBe("BILLING_NOT_FOUND");
    expect(gateway.createSessionUrl).not.toHaveBeenCalled();
  });

  it("given Stripe refuses the session, when the portal opens, then the provider failure is returned", async () => {
    const { useCase, gateway } = setup(Result.ok(Option.some("cus_1")));
    gateway.createSessionUrl.mockResolvedValue(
      Result.fail({ code: "BILLING_PROVIDER_FAILURE", message: "stripe down" }),
    );

    const result = await useCase.execute({ organizationId: "org1", returnUrl: RETURN_URL });

    expect(result.getError().code).toBe("BILLING_PROVIDER_FAILURE");
  });

  it("given the store errors, when the portal opens, then it fails without calling Stripe", async () => {
    const { useCase, gateway } = setup(
      Result.fail({ code: "BILLING_PROVIDER_FAILURE", message: "db down" }),
    );

    const result = await useCase.execute({ organizationId: "org1", returnUrl: RETURN_URL });

    expect(result.getError().code).toBe("BILLING_PROVIDER_FAILURE");
    expect(gateway.createSessionUrl).not.toHaveBeenCalled();
  });
});
