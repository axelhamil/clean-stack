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
import { upgradeSubscriptionMutationOptions } from "../api/mutations/upgrade-subscription";
import { plansQueryOptions } from "../api/queries/billing-plans";

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

interface PricingTableProps {
  isAuthenticated: boolean;
  currentTier: string | null;
  activeOrgId: string | null;
}

export function PricingTable({ isAuthenticated, currentTier, activeOrgId }: PricingTableProps) {
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
              <CardDescription>
                {plan.unitAmount === 0
                  ? "Free"
                  : `${(plan.unitAmount / 100).toFixed(0)} ${plan.currency.toUpperCase()}/${plan.interval}`}
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-2">
              {plan.marketingFeatures.map((f) => (
                <span key={f}>{f}</span>
              ))}
            </CardContent>
            <CardFooter>
              {cta.kind === "current" ? (
                <Button disabled variant="secondary">
                  Current plan
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
                  Get started
                </Button>
              ) : (
                <Button
                  disabled={!activeOrgId || plan.priceId === null}
                  onClick={() =>
                    activeOrgId && upgrade.mutate({ tier: plan.tier, organizationId: activeOrgId })
                  }
                >
                  Upgrade
                </Button>
              )}
            </CardFooter>
          </Card>
        );
      })}
    </section>
  );
}
