import { Button } from "@packages/ui/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@packages/ui/components/ui/card";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import type { TFunction } from "i18next";
import { useTranslation } from "react-i18next";
import { upgradeSubscriptionMutationOptions } from "../api/mutations/upgrade-subscription";
import { plansQueryOptions } from "../api/queries/billing-plans";
import type { PlanCatalogItem } from "../api/queries/billing-types";

export interface PricingCtaArgs {
  isAuthenticated: boolean;
  tier: string;
  currentTier: string | null;
}

export function resolvePricingCta({ isAuthenticated, tier, currentTier }: PricingCtaArgs): {
  kind: "login" | "upgrade" | "current";
} {
  if (!isAuthenticated) return { kind: "login" };
  if (currentTier === tier) return { kind: "current" };
  return { kind: "upgrade" };
}

// Stripe recurring prices declare `interval` as `"day" | "week" | "month" |
// "year"` (`Stripe.Price.Recurring.Interval`); the wire contract widens it to
// `string | null` (`PlanCatalogItem.interval`), so the value must be guarded,
// never cast, before it can key into the catalog. `satisfies Record<PlanInterval,
// string>` only proves every variant has AN entry — it cannot prove each one
// points at the RIGHT one, so `__tests__/pricing-table.test.ts` asserts the
// mapping directly, not just its exhaustiveness.
export type PlanInterval = "day" | "week" | "month" | "year";

const PLAN_INTERVALS: readonly PlanInterval[] = ["day", "week", "month", "year"];

export function isPlanInterval(value: string): value is PlanInterval {
  return (PLAN_INTERVALS as readonly string[]).includes(value);
}

export const INTERVAL_KEYS = {
  day: "pricing.interval.day",
  week: "pricing.interval.week",
  month: "pricing.interval.month",
  year: "pricing.interval.year",
} as const satisfies Record<PlanInterval, string>;

// Replaces a hand-built `${amount} ${CURRENCY}/${interval}` string, which is
// wrong per locale (English wants `$12/month`, French wants `12 €/mois`) and
// untranslatable besides. `Intl.NumberFormat` produces the whole localized
// amount — symbol, spacing and position included — so nothing here
// concatenates a currency symbol by hand.
function formatPlanPrice(t: TFunction<"common">, locale: string, plan: PlanCatalogItem): string {
  if (plan.unitAmount === 0) return t("pricing.free");
  const amount = new Intl.NumberFormat(locale, {
    style: "currency",
    currency: plan.currency.toUpperCase(),
    maximumFractionDigits: 0,
  }).format(plan.unitAmount / 100);
  if (plan.interval !== null && isPlanInterval(plan.interval)) {
    return t("pricing.perInterval", { amount, interval: t(INTERVAL_KEYS[plan.interval]) });
  }
  return amount;
}

interface PricingTableProps {
  isAuthenticated: boolean;
  currentTier: string | null;
  activeOrgId: string | null;
}

export function PricingTable({ isAuthenticated, currentTier, activeOrgId }: PricingTableProps) {
  const { t, i18n } = useTranslation("common");
  const { data: plans = [] } = useQuery(plansQueryOptions);
  const navigate = useNavigate();
  const upgrade = useMutation(upgradeSubscriptionMutationOptions);

  return (
    <section className="flex flex-col gap-4 md:flex-row">
      {plans.map((plan) => {
        const cta = resolvePricingCta({ isAuthenticated, tier: plan.tier, currentTier });
        return (
          <Card key={plan.tier} className="flex-1">
            <CardHeader>
              <CardTitle>{plan.name}</CardTitle>
              <CardDescription>{formatPlanPrice(t, i18n.language, plan)}</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-2">
              {plan.marketingFeatures.map((f) => (
                <span key={f}>{f}</span>
              ))}
            </CardContent>
            <CardFooter>
              {cta.kind === "current" ? (
                <Button disabled variant="secondary">
                  {t("pricing.currentPlanCta")}
                </Button>
              ) : cta.kind === "login" ? (
                <Button
                  onClick={() =>
                    void navigate({
                      to: "/sign-in",
                      search: { redirect: `/pricing?plan=${plan.tier}` },
                    })
                  }
                >
                  {t("pricing.getStarted")}
                </Button>
              ) : (
                <Button
                  disabled={!activeOrgId || plan.priceId === null}
                  onClick={() =>
                    activeOrgId && upgrade.mutate({ tier: plan.tier, organizationId: activeOrgId })
                  }
                >
                  {t("pricing.upgrade")}
                </Button>
              )}
            </CardFooter>
          </Card>
        );
      })}
    </section>
  );
}
