import { Alert, AlertDescription } from "@packages/ui/components/ui/alert";
import { Button } from "@packages/ui/components/ui/button";
import { PageHeader } from "@packages/ui/components/ui/page-header";
import { Progress } from "@packages/ui/components/ui/progress";
import { Separator } from "@packages/ui/components/ui/separator";
import { SettingsSection } from "@packages/ui/components/ui/settings-section";
import { TypographyP } from "@packages/ui/components/ui/typography";
import { toastError } from "@packages/web-kit/api/errors/toast";
import { errorFallback } from "@packages/web-kit/i18n/get-errors-t";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { activeOrgQueryOptions } from "../../shared/api/queries/active-org";
import { orgMembersQueryOptions } from "../../shared/api/queries/org-members";
import {
  SUBSCRIPTION_QUERY_PREFIX,
  subscriptionQueryOptions,
} from "../../shared/api/queries/subscription";
import { ensureOrgPermission } from "../../shared/auth/ensure-org-permission";
import { GuardHint } from "../../shared/auth/guard-hint";
import { ImpersonationReason } from "../../shared/auth/impersonation-reason";
import { useActiveOrgId } from "../../shared/auth/use-active-org-id";
import { useEntitlements } from "../../shared/auth/use-entitlements";
import { useImpersonationGuard } from "../../shared/auth/use-impersonation-guard";
import { PricingTable } from "../../shared/components/pricing-table";
import { QueryLoadError } from "../../shared/components/query-load-error";
import { billingSearchSchema } from "./billing.schema";
import { isSubscriptionStatus, STATUS_KEYS, TIER_KEYS } from "./billing-labels";
import { useOpenPortal } from "./hooks/use-open-portal";

export const Route = createFileRoute("/_protected/_shell/settings/_org-scope/billing")({
  validateSearch: billingSearchSchema,
  beforeLoad: ensureOrgPermission({ billing: ["manage"] }),
  component: BillingPage,
});

function BillingPage() {
  const { t } = useTranslation("settings");
  const { upgraded } = Route.useSearch();
  const navigate = Route.useNavigate();
  const queryClient = useQueryClient();
  const { data: activeOrg } = useQuery(activeOrgQueryOptions);
  const membersQuery = useQuery(orgMembersQueryOptions(activeOrg?.id ?? null));
  const subscription = useQuery(subscriptionQueryOptions(useActiveOrgId()));
  const members = membersQuery.data ?? [];
  const ent = useEntitlements();
  const portal = useOpenPortal();
  const guard = useImpersonationGuard();
  const isPaid = ent.tier !== "free";
  const memberCount = members.length;
  const statusLabel = isSubscriptionStatus(ent.status) ? t(STATUS_KEYS[ent.status]) : ent.status;
  const [returnedFromCheckout] = useState(upgraded !== undefined);
  const checkoutHandled = useRef(false);
  const awaitingActivation = returnedFromCheckout && !isPaid;
  const loadFailed = subscription.isLoadingError || membersQuery.isLoadingError;

  useEffect(() => {
    if (upgraded === undefined || checkoutHandled.current) return;

    checkoutHandled.current = true;
    toast.success(t("billing.checkoutReturnToast"));
    void queryClient.invalidateQueries({ queryKey: SUBSCRIPTION_QUERY_PREFIX });
    void navigate({ search: {}, replace: true });
  }, [upgraded, t, queryClient, navigate]);

  const refreshPlan = async () => {
    const result = await subscription.refetch();
    if (result.isError) toastError(result.error, errorFallback("loadSubscription"));
  };

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
      {awaitingActivation && (
        <Alert>
          <AlertDescription className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
            {t("billing.activationPending")}
            <Button
              variant="outline"
              size="sm"
              disabled={subscription.isFetching}
              onClick={() => void refreshPlan()}
            >
              {t("billing.refreshPlan")}
            </Button>
          </AlertDescription>
        </Alert>
      )}
      {loadFailed ? (
        <QueryLoadError
          message={t("billing.loadFailed")}
          isFetching={subscription.isFetching || membersQuery.isFetching}
          onRetry={() => {
            if (subscription.isLoadingError) void subscription.refetch();
            if (membersQuery.isLoadingError) void membersQuery.refetch();
          }}
        />
      ) : (
        <>
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
          {!isPaid && !awaitingActivation && (
            <>
              <Separator />
              <PricingTable
                isAuthenticated
                currentTier={ent.tier}
                activeOrgId={activeOrg?.id ?? null}
              />
            </>
          )}
        </>
      )}
    </main>
  );
}
