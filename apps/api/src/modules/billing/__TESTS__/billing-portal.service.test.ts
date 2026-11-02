import { describe, expect, it, mock } from "bun:test";
import { Option, Result } from "@packages/ddd-kit";
import type { IBillingPortalGateway } from "../application/ports/billing-portal.port";
import type {
  BillingError,
  ISubscriptionReadStore,
  SubscriptionRow,
} from "../application/ports/subscription-read.port";
import { BillingPortalService } from "../application/services/billing-portal.service";

function makeStore(customer: Result<Option<string>, BillingError>): ISubscriptionReadStore {
  return {
    findActiveByReference: mock(async () =>
      Result.ok<Option<SubscriptionRow>, BillingError>(Option.none()),
    ),
    findCustomerIdByReference: mock(async () => customer),
  };
}

function makeGateway(): IBillingPortalGateway {
  return { createSessionUrl: mock(async () => "https://billing.stripe.test/session") };
}

describe("BillingPortalService", () => {
  describe("openPortal", () => {
    it("opens a portal session for the org's Stripe customer", async () => {
      const gateway = makeGateway();
      const svc = new BillingPortalService(makeStore(Result.ok(Option.some("cus_1"))), gateway);

      const result = await svc.openPortal("org1", "https://app.test/settings/billing");

      expect(result.getValue()).toBe("https://billing.stripe.test/session");
      expect(gateway.createSessionUrl).toHaveBeenCalledWith(
        "cus_1",
        "https://app.test/settings/billing",
      );
    });

    it("fails with BILLING_NOT_FOUND when the org has no paid subscription", async () => {
      const gateway = makeGateway();
      const svc = new BillingPortalService(makeStore(Result.ok(Option.none())), gateway);

      const result = await svc.openPortal("org1", "https://app.test/settings/billing");

      expect(result.getError().code).toBe("BILLING_NOT_FOUND");
      expect(gateway.createSessionUrl).not.toHaveBeenCalled();
    });

    it("fails with BILLING_PROVIDER_FAILURE when the store errors", async () => {
      const gateway = makeGateway();
      const store = makeStore(
        Result.fail({ code: "BILLING_PROVIDER_FAILURE", message: "db down" }),
      );
      const svc = new BillingPortalService(store, gateway);

      const result = await svc.openPortal("org1", "https://app.test/settings/billing");

      expect(result.getError().code).toBe("BILLING_PROVIDER_FAILURE");
      expect(gateway.createSessionUrl).not.toHaveBeenCalled();
    });
  });
});
