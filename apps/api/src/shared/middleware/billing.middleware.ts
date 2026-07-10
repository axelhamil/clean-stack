import { AppErrorException } from "@packages/ddd-kit";
import { createMiddleware } from "hono/factory";
import { di } from "../../container";
import {
  type EntitlementsView,
  type Feature,
  hasFeature,
  hasSeatAvailable,
  meetsPlan,
  type Tier,
} from "../../modules/billing/config";

function paymentRequired(message: string): never {
  throw new AppErrorException({ code: "BILLING_PAYMENT_REQUIRED", message });
}

export function assertFeature(view: EntitlementsView, flag: Feature): void {
  if (!hasFeature(view, flag)) paymentRequired(`Plan does not include feature: ${flag}`);
}

export function assertPlan(view: EntitlementsView, minTier: Tier): void {
  if (!meetsPlan(view, minTier)) paymentRequired(`Plan below required tier: ${minTier}`);
}

export function assertSeat(activeMembers: number, maxMembers: number): void {
  if (!hasSeatAvailable(activeMembers, maxMembers)) {
    paymentRequired(`Seat limit reached (${maxMembers}).`);
  }
}

export const requireFeature = (flag: Feature) =>
  createMiddleware<{ Variables: { orgId: string } }>(async (c, next) => {
    const view = await di.EntitlementsService.getEntitlements(c.get("orgId"));
    assertFeature(view, flag);
    await next();
  });

export const requirePlan = (minTier: Tier) =>
  createMiddleware<{ Variables: { orgId: string } }>(async (c, next) => {
    const view = await di.EntitlementsService.getEntitlements(c.get("orgId"));
    assertPlan(view, minTier);
    await next();
  });
