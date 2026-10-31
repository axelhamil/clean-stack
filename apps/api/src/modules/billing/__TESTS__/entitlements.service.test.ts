import { describe, expect, it, mock, spyOn } from "bun:test";
import { Option, Result } from "@packages/ddd-kit";
import { mockPort } from "@packages/test/bun";
import { ENTITLEMENTS } from "../../../shared/entitlements";
import type {
  ActivePlanOverride,
  IPlanOverrideStore,
  PlanOverrideStoreError,
} from "../../../shared/ports/plan-override.port";
import { NoOpInstrumentation } from "../../../shared/services/noop-instrumentation";
import type {
  BillingError,
  ISubscriptionReadStore,
  SubscriptionRow,
} from "../application/ports/subscription-read.port";
import { EntitlementsService } from "../application/services/entitlements.service";

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

const ACTIVE: ActivePlanOverride = {
  id: "ov-1",
  organizationId: "org1",
  tier: "business",
  expiresAt: new Date("2030-01-01"),
  note: "Pilot",
  createdAt: new Date("2026-01-01"),
};

function makeOverrides(row: ActivePlanOverride | null, fail = false): IPlanOverrideStore {
  const store = mockPort<IPlanOverrideStore>();
  store.findActive.mockImplementation(async () =>
    fail
      ? Result.fail<Option<ActivePlanOverride>, PlanOverrideStoreError>({
          code: "PLAN_OVERRIDE_PROVIDER_FAILURE",
          message: "db down",
        })
      : Result.ok(Option.fromNullable(row)),
  );

  return store;
}

function serviceOver(store: ISubscriptionReadStore, overrides = makeOverrides(null)) {
  return new EntitlementsService(store, overrides, new NoOpInstrumentation());
}

describe("EntitlementsService", () => {
  it("resolves the org's tier from the active subscription row", async () => {
    const svc = serviceOver(makeStore({ tier: "pro", status: "active" }));
    const view = await svc.getEntitlements("org1");
    expect(view.tier).toBe("pro");
    expect(view.maxMembers).toBe(ENTITLEMENTS.pro.maxMembers);
    expect(view.features).toEqual(ENTITLEMENTS.pro.features);
    expect(view.status).toBe("active");
  });

  it("defaults to free when there is no active subscription", async () => {
    const svc = serviceOver(makeStore(null));
    const view = await svc.getEntitlements("org1");
    expect(view.tier).toBe("free");
    expect(view.status).toBe("free");
  });

  it("fails closed to free when the store errors", async () => {
    const svc = serviceOver(makeStore(null, true));
    const view = await svc.getEntitlements("org1");
    expect(view.tier).toBe("free");
  });

  it("gives an active override's tier over the subscription, keeping the subscription status", async () => {
    const svc = serviceOver(makeStore({ tier: "pro", status: "active" }), makeOverrides(ACTIVE));

    const view = await svc.getEntitlements("org1");

    expect(view.tier).toBe("business");
    expect(view.maxMembers).toBe(ENTITLEMENTS.business.maxMembers);
    expect(view.features).toEqual(ENTITLEMENTS.business.features);
    expect(view.status).toBe("active");
  });

  it("says the plan is an override when no subscription backs it", async () => {
    const svc = serviceOver(makeStore(null), makeOverrides(ACTIVE));

    const view = await svc.getEntitlements("org1");

    expect(view.tier).toBe("business");
    expect(view.status).toBe("override");
  });

  it("keeps the paid subscription when the override read errors, and reports the failure", async () => {
    const instrumentation = new NoOpInstrumentation();
    const capture = spyOn(instrumentation, "capture");
    const svc = new EntitlementsService(
      makeStore({ tier: "pro", status: "active" }),
      makeOverrides(null, true),
      instrumentation,
    );

    const view = await svc.getEntitlements("org1");

    expect(view.tier).toBe("pro");
    expect(capture).toHaveBeenCalledTimes(1);
  });

  it("surfaces a read failure of either source to the caller that must not show a guess", async () => {
    const overrideDown = serviceOver(
      makeStore({ tier: "pro", status: "active" }),
      makeOverrides(null, true),
    );
    const subscriptionDown = serviceOver(makeStore(null, true));

    const first = await overrideDown.readEntitlements("org1");
    const second = await subscriptionDown.readEntitlements("org1");

    expect(first.getError().code).toBe("PLAN_OVERRIDE_PROVIDER_FAILURE");
    expect(second.getError().code).toBe("BILLING_PROVIDER_FAILURE");
  });

  it("says whether a subscription backs the plan, an override alone has no billing portal", async () => {
    const backed = serviceOver(makeStore({ tier: "pro", status: "active" }), makeOverrides(ACTIVE));
    const overrideOnly = serviceOver(makeStore(null), makeOverrides(ACTIVE));

    expect((await backed.getEntitlements("org1")).hasSubscription).toBe(true);
    expect((await overrideOnly.getEntitlements("org1")).hasSubscription).toBe(false);
  });

  it("ignores an override whose tier left the catalog", async () => {
    const svc = serviceOver(
      makeStore({ tier: "pro", status: "active" }),
      makeOverrides({ ...ACTIVE, tier: "retired" }),
    );

    const view = await svc.getEntitlements("org1");

    expect(view.tier).toBe("pro");
  });
});
