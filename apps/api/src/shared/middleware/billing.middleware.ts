import { AppErrorException } from "@packages/ddd-kit";
import { EventTypes } from "@packages/events";
import type { Context } from "hono";
import { createMiddleware } from "hono/factory";
import { di } from "../../container";
import {
  type EntitlementsView,
  type Feature,
  hasFeature,
  hasQuotaRemaining,
  hasSeatAvailable,
  meetsPlan,
  type QuotaKey,
  type Tier,
} from "../../modules/billing/config";
import { emitEvent } from "../event-emitter";
import { logger } from "../logger";

function paymentRequired(message: string): never {
  throw new AppErrorException({ code: "BILLING_PAYMENT_REQUIRED", message });
}

function quotaExceeded(message: string): never {
  throw new AppErrorException({ code: "BILLING_QUOTA_EXCEEDED", message });
}

export function assertFeature(view: EntitlementsView, flag: Feature): void {
  if (!hasFeature(view, flag)) paymentRequired(`Plan does not include feature: ${flag}`);
}

export function assertPlan(view: EntitlementsView, minTier: Tier): void {
  if (!meetsPlan(view, minTier)) paymentRequired(`Plan below required tier: ${minTier}`);
}

export function assertSeat(activeMembers: number, maxMembers: number | null): void {
  if (!hasSeatAvailable(activeMembers, maxMembers)) {
    paymentRequired(`Seat limit reached (${maxMembers ?? "∞"}).`);
  }
}

export function assertQuota(used: number, limit: number | null): void {
  if (!hasQuotaRemaining(used, limit)) {
    quotaExceeded(`Quota exceeded (${used}/${limit}).`);
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

async function emitQuotaExceeded(
  orgId: string,
  actorUserId: string,
  key: QuotaKey,
  limit: number,
  attempted: number,
  tier: Tier,
): Promise<void> {
  await emitEvent(
    di.IOutboxRepository,
    EventTypes.BILLING_QUOTA_EXCEEDED,
    "organization",
    orgId,
    { organizationId: orgId, resource: key, limit, attempted, tier, actorUserId },
    { organizationId: orgId },
  );
}

export const requireQuota = (key: QuotaKey, readUsage: (c: Context) => Promise<number>) =>
  createMiddleware<{ Variables: { orgId: string; user: { id: string } } }>(async (c, next) => {
    const orgId = c.get("orgId");
    const view = await di.EntitlementsService.getEntitlements(orgId);
    const limit = view.quotas[key];
    const used = await readUsage(c);
    if (limit !== null && used >= limit) {
      try {
        await emitQuotaExceeded(orgId, c.get("user").id, key, limit, used, view.tier);
      } catch (err) {
        // telemetry must never break enforcement — the event is operational, not compliance
        logger.warn({ err }, "billing: quota exceeded event emit failed — still enforcing 429");
      }
      quotaExceeded(`Quota exceeded for ${key} (${used}/${limit}).`);
    }
    await next();
  });
