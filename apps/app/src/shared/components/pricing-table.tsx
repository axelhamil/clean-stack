import { Button } from "@packages/ui/components/ui/button";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@packages/ui/components/ui/card";
import { LoadErrorAlert } from "@packages/ui/components/ui/load-error-alert";
import { Skeleton, SkeletonGroup } from "@packages/ui/components/ui/skeleton";
import {
  TypographyLarge,
  TypographyList,
  TypographyMuted,
} from "@packages/ui/components/ui/typography";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import type { TFunction } from "i18next";
import { useTranslation } from "react-i18next";
import { upgradeSubscriptionMutationOptions } from "../api/mutations/upgrade-subscription";
import { plansQueryOptions } from "../api/queries/billing-plans";
import type { PlanCatalogItem } from "../api/queries/billing-types";

export interface PricingCtaArgs {
  isAuthenticated: boolean | null;
  tier: string;
  currentTier: string | null;
}

export function resolvePricingCta({ isAuthenticated, tier, currentTier }: PricingCtaArgs): {
  kind: "unavailable" | "login" | "upgrade" | "current";
} {
  if (isAuthenticated === null) return { kind: "unavailable" };
  if (!isAuthenticated) return { kind: "login" };
  if (currentTier === tier) return { kind: "current" };
  return { kind: "upgrade" };
}

export function resolvePrimaryTier(
  plans: readonly Pick<PlanCatalogItem, "tier" | "rank" | "unitAmount">[],
  currentTier: string | null,
): PlanCatalogItem["tier"] | null {
  const currentRank = plans.find((plan) => plan.tier === currentTier)?.rank ?? -1;
  const upgrades = plans.filter((plan) => plan.rank > currentRank && plan.unitAmount > 0);
  const [next] = upgrades.toSorted((a, b) => a.rank - b.rank);

  return next?.tier ?? null;
}

// Stripe recurring prices declare `interval` as `"day" | "week" | "month" |
// "year"` (`Stripe.Price.Recurring.Interval`); the wire contract widens it to
// `string | null` (`PlanCatalogItem.interval`), so the value must be guarded,
// never cast, before it can key into the catalog. `satisfies Record<PlanInterval,
// string>` only proves every variant has AN entry: it cannot prove each one
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
// amount (symbol, spacing and position included), so nothing here
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
  isAuthenticated: boolean | null;
  currentTier: string | null;
  activeOrgId: string | null;
}

export function PricingTable({ isAuthenticated, currentTier, activeOrgId }: PricingTableProps) {
  const { t, i18n } = useTranslation("common");
  const { data: plans = [], isPending, isLoadingError } = useQuery(plansQueryOptions);
  const navigate = useNavigate();
  const upgrade = useMutation(upgradeSubscriptionMutationOptions);

  if (isPending) return <PricingTableSkeleton label={t("pricing.loading")} />;

  if (isLoadingError) {
    return <LoadErrorAlert message={t("pricing.loadFailed")} />;
  }

  if (plans.length === 0) return <TypographyMuted>{t("pricing.empty")}</TypographyMuted>;

  const primaryTier = resolvePrimaryTier(plans, currentTier);

  return (
    <section className="flex flex-col gap-4 md:flex-row">
      {plans.map((plan) => {
        const cta = resolvePricingCta({ isAuthenticated, tier: plan.tier, currentTier });
        const ctaVariant = plan.tier === primaryTier ? "default" : "outline";

        return (
          <Card key={plan.tier} className="flex-1">
            <CardHeader>
              <CardTitle asChild>
                <h2>{plan.name}</h2>
              </CardTitle>
              <TypographyLarge>{formatPlanPrice(t, i18n.language, plan)}</TypographyLarge>
            </CardHeader>
            <CardContent className="flex-1">
              <TypographyList>
                {plan.marketingFeatures.map((f) => (
                  <li key={f}>{f}</li>
                ))}
              </TypographyList>
            </CardContent>
            <CardFooter>
              {cta.kind === "unavailable" ? (
                <Button disabled variant={ctaVariant} className="w-full">
                  {t("pricing.getStarted")}
                </Button>
              ) : cta.kind === "current" ? (
                <Button disabled variant="secondary" className="w-full">
                  {t("pricing.currentPlanCta")}
                </Button>
              ) : cta.kind === "login" ? (
                <Button
                  variant={ctaVariant}
                  className="w-full"
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
                  variant={ctaVariant}
                  className="w-full"
                  disabled={!activeOrgId || plan.priceId === null || upgrade.isPending}
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

const SKELETON_PLANS = ["free", "pro", "business"] as const;

interface PricingTableSkeletonProps {
  label: string;
}

function PricingTableSkeleton({ label }: PricingTableSkeletonProps) {
  return (
    <SkeletonGroup label={label} className="gap-4 md:flex-row">
      {SKELETON_PLANS.map((plan) => (
        <Card key={plan} className="flex-1">
          <CardHeader>
            <Skeleton className="h-5 w-24" />
            <Skeleton className="h-7 w-20" />
          </CardHeader>
          <CardContent className="flex flex-1 flex-col gap-2">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-4/5" />
            <Skeleton className="h-4 w-2/3" />
          </CardContent>
          <CardFooter>
            <Skeleton className="h-9 w-full" />
          </CardFooter>
        </Card>
      ))}
    </SkeletonGroup>
  );
}
