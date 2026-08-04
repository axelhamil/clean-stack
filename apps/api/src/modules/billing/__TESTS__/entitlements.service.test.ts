import { describe, expect, it, mock } from "bun:test";
import { Option, Result } from "@packages/ddd-kit";
import { NoOpInstrumentation } from "../../../shared/services/noop-instrumentation";
import type {
  BillingError,
  ISubscriptionReadStore,
  SubscriptionRow,
} from "../application/ports/subscription-read.port";
import { EntitlementsService } from "../application/services/entitlements.service";
import { ENTITLEMENTS } from "../config";

function makeStore(row: SubscriptionRow | null, fail = false): ISubscriptionReadStore {
  return {
    findActiveByReference: mock(async () =>
      fail
        ? Result.fail<Option<SubscriptionRow>, BillingError>({
            code: "BILLING_PROVIDER_FAILURE",
            message: "db down",
          })
        : Result.ok<Option<SubscriptionRow>, BillingError>(Option.fromNullable(row)),
    ),
    findCustomerIdByReference: mock(async () =>
      Result.ok<Option<string>, BillingError>(Option.none()),
    ),
  };
}

describe("EntitlementsService", () => {
  it("resolves the org's tier from the active subscription row", async () => {
    const svc = new EntitlementsService(
      makeStore({ tier: "pro", status: "active" }),
      new NoOpInstrumentation(),
    );
    const view = await svc.getEntitlements("org1");
    expect(view.tier).toBe("pro");
    expect(view.maxMembers).toBe(ENTITLEMENTS.pro.maxMembers);
    expect(view.features).toEqual(ENTITLEMENTS.pro.features);
    expect(view.status).toBe("active");
  });

  it("defaults to free when there is no active subscription", async () => {
    const svc = new EntitlementsService(makeStore(null), new NoOpInstrumentation());
    const view = await svc.getEntitlements("org1");
    expect(view.tier).toBe("free");
    expect(view.status).toBe("free");
  });

  it("fails closed to free when the store errors", async () => {
    const svc = new EntitlementsService(makeStore(null, true), new NoOpInstrumentation());
    const view = await svc.getEntitlements("org1");
    expect(view.tier).toBe("free");
  });
});
