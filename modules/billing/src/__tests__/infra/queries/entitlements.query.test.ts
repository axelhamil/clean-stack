import { describe, expect, it, mock } from "bun:test";
import { Option, Result } from "@packages/ddd-kit";
import { mockPort } from "@packages/test/bun";
import { mockInstrumentation } from "@packages/test/bun/instrumentation";
import type {
  ActivePlanOverride,
  IPlanOverrideStore,
  PlanOverrideStoreError,
} from "../../../application/ports/repositories/plan-override.port";
import type {
  BillingError,
  ISubscriptionReadStore,
  SubscriptionRow,
} from "../../../application/ports/repositories/subscription-read.port";
import { ENTITLEMENTS } from "../../../application/services/entitlement-policy.service";
import { FailClosedEntitlementsQuery } from "../../../infra/queries/get-entitlements.query";
import { StrictEntitlementsQuery } from "../../../infra/queries/read-entitlements.query";

function makeStore(
  row: SubscriptionRow | null,
  fail = false,
  customer: string | null = row && "cus_1",
): ISubscriptionReadStore {
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
      Result.ok<Option<string>, BillingError>(Option.fromNullable(customer)),
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

function queriesOver(store: ISubscriptionReadStore, overrides = makeOverrides(null)) {
  const instrumentation = mockInstrumentation();
  const failClosed = new FailClosedEntitlementsQuery(store, overrides, instrumentation);
  const strict = new StrictEntitlementsQuery(store, overrides, instrumentation);

  return {
    view: async () => (await failClosed.execute({ organizationId: "org1" })).getValue(),
    read: () => strict.execute({ organizationId: "org1" }),
  };
}

describe("entitlements queries", () => {
  it("resolves the org's tier from the active subscription row", async () => {
    const svc = queriesOver(makeStore({ tier: "pro", status: "active" }));
    const view = await svc.view();
    expect(view.tier).toBe("pro");
    expect(view.maxMembers).toBe(ENTITLEMENTS.pro.maxMembers);
    expect(view.features).toEqual(ENTITLEMENTS.pro.features);
    expect(view.status).toBe("active");
  });

  it("defaults to free when there is no active subscription", async () => {
    const svc = queriesOver(makeStore(null));
    const view = await svc.view();
    expect(view.tier).toBe("free");
    expect(view.status).toBe("free");
  });

  it("keeps a past due org on the free tier and still offers it the billing portal", async () => {
    const svc = queriesOver(makeStore(null, false, "cus_1"));

    const view = await svc.view();

    expect(view.tier).toBe("free");
    expect(view.status).toBe("free");
    expect(view.hasSubscription).toBe(true);
  });

  it("fails closed to free when the store errors", async () => {
    const svc = queriesOver(makeStore(null, true));
    const view = await svc.view();
    expect(view.tier).toBe("free");
  });

  it("gives an active override's tier over the subscription, keeping the subscription status", async () => {
    const svc = queriesOver(makeStore({ tier: "pro", status: "active" }), makeOverrides(ACTIVE));

    const view = await svc.view();

    expect(view.tier).toBe("business");
    expect(view.maxMembers).toBe(ENTITLEMENTS.business.maxMembers);
    expect(view.features).toEqual(ENTITLEMENTS.business.features);
    expect(view.status).toBe("active");
  });

  it("says the plan is an override when no subscription backs it", async () => {
    const svc = queriesOver(makeStore(null), makeOverrides(ACTIVE));

    const view = await svc.view();

    expect(view.tier).toBe("business");
    expect(view.status).toBe("override");
  });

  it("keeps the paid subscription when the override read errors, and reports the failure", async () => {
    const instrumentation = mockInstrumentation();
    const capture = instrumentation.capture;
    const query = new FailClosedEntitlementsQuery(
      makeStore({ tier: "pro", status: "active" }),
      makeOverrides(null, true),
      instrumentation,
    );

    const view = (await query.execute({ organizationId: "org1" })).getValue();

    expect(view.tier).toBe("pro");
    expect(capture).toHaveBeenCalledTimes(1);
  });

  it("surfaces a read failure of either source to the caller that must not show a guess", async () => {
    const overrideDown = queriesOver(
      makeStore({ tier: "pro", status: "active" }),
      makeOverrides(null, true),
    );
    const subscriptionDown = queriesOver(makeStore(null, true));

    const first = await overrideDown.read();
    const second = await subscriptionDown.read();

    expect(first.getError().code).toBe("PLAN_OVERRIDE_PROVIDER_FAILURE");
    expect(second.getError().code).toBe("BILLING_PROVIDER_FAILURE");
  });

  it("says whether a subscription backs the plan, an override alone has no billing portal", async () => {
    const backed = queriesOver(makeStore({ tier: "pro", status: "active" }), makeOverrides(ACTIVE));
    const overrideOnly = queriesOver(makeStore(null), makeOverrides(ACTIVE));

    expect((await backed.view()).hasSubscription).toBe(true);
    expect((await overrideOnly.view()).hasSubscription).toBe(false);
  });

  it("ignores an override whose tier left the catalog", async () => {
    const svc = queriesOver(
      makeStore({ tier: "pro", status: "active" }),
      makeOverrides({ ...ACTIVE, tier: "retired" }),
    );

    const view = await svc.view();

    expect(view.tier).toBe("pro");
  });
});
