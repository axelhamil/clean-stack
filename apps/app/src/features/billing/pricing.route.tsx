import { pageContainerVariants } from "@packages/ui/components/ui/page-container";
import { PageHeader } from "@packages/ui/components/ui/page-header";
import { cn } from "@packages/ui/libs/utils.js";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { activeOrgQueryOptions } from "../../shared/api/queries/active-org";
import { sessionQueryOptions } from "../../shared/api/queries/session";
import { subscriptionQueryOptions } from "../../shared/api/queries/subscription";
import { PricingTable } from "../../shared/components/pricing-table";

export const Route = createFileRoute("/pricing")({
  validateSearch: (s: Record<string, unknown>) => ({
    plan: typeof s.plan === "string" ? s.plan : undefined,
  }),
  component: PricingPage,
});

function PricingPage() {
  const { t } = useTranslation("common");
  const {
    data: session,
    isPending: isSessionPending,
    isError: isSessionError,
  } = useQuery(sessionQueryOptions);
  const isAuthenticated = session ? true : isSessionPending || isSessionError ? null : false;
  const { data: activeOrg } = useQuery({ ...activeOrgQueryOptions, enabled: Boolean(session) });
  const organizationId = activeOrg?.id ?? null;
  const { data: sub } = useQuery({
    ...subscriptionQueryOptions(organizationId),
    enabled: organizationId !== null && Boolean(session),
  });

  return (
    <main className={cn(pageContainerVariants(), "flex flex-col gap-8 py-8")}>
      <PageHeader title={t("pricing.title")} description={t("pricing.subtitle")} />
      <PricingTable
        isAuthenticated={isAuthenticated}
        currentTier={sub?.tier ?? null}
        activeOrgId={organizationId}
      />
    </main>
  );
}
