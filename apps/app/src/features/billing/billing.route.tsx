import { Button } from "@packages/ui/components/ui/button";
import { PageHeader } from "@packages/ui/components/ui/page-header";
import { Progress } from "@packages/ui/components/ui/progress";
import { Separator } from "@packages/ui/components/ui/separator";
import { SettingsSection } from "@packages/ui/components/ui/settings-section";
import { TypographyP } from "@packages/ui/components/ui/typography";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { activeOrgQueryOptions } from "../../shared/api/queries/active-org";
import { orgMembersQueryOptions } from "../../shared/api/queries/org-members";
import { ensureOrgPermission } from "../../shared/auth/ensure-org-permission";
import { GuardHint } from "../../shared/auth/guard-hint";
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
  const { data: members = [] } = useQuery(orgMembersQueryOptions(activeOrg?.id ?? null));
  const ent = useEntitlements();
  const portal = useOpenPortal();
  const guard = useImpersonationGuard();
  const isPaid = ent.tier !== "free";
  const memberCount = members.length;
  const statusLabel = isSubscriptionStatus(ent.status) ? t(STATUS_KEYS[ent.status]) : ent.status;

  return (
    <main className="flex flex-col gap-8">
      <PageHeader
        title={t("billing.pageTitle")}
        actions={
          isPaid && (
            <GuardHint guard={guard} otherwiseDisabled={portal.isPending}>
              <Button
                onClick={() => portal.mutate()}
                disabled={portal.isPending || guard.blocked}
                {...guard.describeProps(portal.isPending)}
              >
                {t("billing.manageBilling")}
              </Button>
            </GuardHint>
          )
        }
      />
      <ImpersonationReason guard={guard} />
      <SettingsSection
        title={t("billing.currentPlanTitle", { tier: t(TIER_KEYS[ent.tier]) })}
        description={t("billing.statusLabel", { status: statusLabel })}
      >
        {ent.maxMembers === null ? (
          <TypographyP>{t("billing.unlimitedMembers")}</TypographyP>
        ) : (
          <div className="flex flex-col gap-2">
            <TypographyP>
              {t("billing.membersUsage", { count: memberCount, max: ent.maxMembers })}
            </TypographyP>
            <Progress
              value={(memberCount / ent.maxMembers) * 100}
              aria-label={t("billing.membersUsageAriaLabel")}
            />
          </div>
        )}
      </SettingsSection>
      {!isPaid && (
        <>
          <Separator />
          <PricingTable
            isAuthenticated
            currentTier={ent.tier}
            activeOrgId={activeOrg?.id ?? null}
          />
        </>
      )}
    </main>
  );
}
