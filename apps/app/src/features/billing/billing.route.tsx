import { Button } from "@packages/ui/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@packages/ui/components/ui/card";
import { Progress } from "@packages/ui/components/ui/progress";
import { TypographyH1 } from "@packages/ui/components/ui/typography";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { activeOrgQueryOptions } from "../../shared/api/queries/active-org";
import { orgMembersQueryOptions } from "../../shared/api/queries/org-members";
import { ensureOrgPermission } from "../../shared/auth/ensure-org-permission";
import { ImpersonationReason } from "../../shared/auth/impersonation-reason";
import { useEntitlements } from "../../shared/auth/use-entitlements";
import { useImpersonationGuard } from "../../shared/auth/use-impersonation-guard";
import { PricingTable } from "../../shared/components/pricing-table";
import { isSubscriptionStatus, STATUS_KEYS, TIER_KEYS } from "./billing-labels";
import { useOpenPortal } from "./hooks/use-open-portal";

export const Route = createFileRoute("/_protected/_shell/settings/_org-scope/billing")({
  beforeLoad: ensureOrgPermission({ billing: ["manage"] }),
  component: BillingPage,
});

function BillingPage() {
  const { t } = useTranslation("settings");
  const { data: activeOrg } = useQuery(activeOrgQueryOptions);
  const { data: members = [] } = useQuery({
    ...orgMembersQueryOptions(activeOrg?.id ?? ""),
    enabled: !!activeOrg?.id,
  });
  const ent = useEntitlements();
  const portal = useOpenPortal();
  const guard = useImpersonationGuard();
  const isPaid = ent.tier !== "free";
  const memberCount = members.length;
  const statusLabel = isSubscriptionStatus(ent.status) ? t(STATUS_KEYS[ent.status]) : ent.status;

  return (
    <main className="flex flex-col gap-6">
      <TypographyH1 className="sr-only">{t("billing.pageTitle")}</TypographyH1>
      <Card>
        <CardHeader>
          <CardTitle>{t("billing.currentPlanTitle", { tier: t(TIER_KEYS[ent.tier]) })}</CardTitle>
          <CardDescription>{t("billing.statusLabel", { status: statusLabel })}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {ent.maxMembers === null ? (
            <span>{t("billing.unlimitedMembers")}</span>
          ) : (
            <>
              <span>{t("billing.membersUsage", { count: memberCount, max: ent.maxMembers })}</span>
              <Progress
                value={(memberCount / ent.maxMembers) * 100}
                aria-label={t("billing.membersUsageAriaLabel")}
              />
            </>
          )}
          {isPaid && (
            <Button
              onClick={() => portal.mutate()}
              disabled={portal.isPending || guard.blocked}
              {...guard.describeProps(portal.isPending)}
            >
              {t("billing.manageBilling")}
            </Button>
          )}
        </CardContent>
      </Card>
      <ImpersonationReason guard={guard} />
      {!isPaid && (
        <PricingTable isAuthenticated currentTier={ent.tier} activeOrgId={activeOrg?.id ?? null} />
      )}
    </main>
  );
}
