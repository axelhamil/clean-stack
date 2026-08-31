import { TypographyH1, TypographyMuted } from "@packages/ui/components/ui/typography";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { activeOrgQueryOptions } from "../../shared/api/queries/active-org";
import { sessionQueryOptions } from "../../shared/api/queries/session";
import { subscriptionQueryOptions } from "../../shared/api/queries/subscription";
import { PricingTable } from "../../shared/components/pricing-table";

export const Route = createFileRoute("/pricing")({
  validateSearch: (s: Record<string, unknown>) => ({ plan: (s.plan as string) ?? undefined }),
  component: PricingPage,
});

function PricingPage() {
  const { t } = useTranslation("common");
  const { data: session } = useQuery(sessionQueryOptions);
  const { data: activeOrg } = useQuery({ ...activeOrgQueryOptions, enabled: Boolean(session) });
  const { data: sub } = useQuery({ ...subscriptionQueryOptions, enabled: Boolean(session) });

  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-8 p-8">
      <header className="flex flex-col gap-2">
        <TypographyH1>{t("pricing.title")}</TypographyH1>
        <TypographyMuted>{t("pricing.subtitle")}</TypographyMuted>
      </header>
      <PricingTable
        isAuthenticated={Boolean(session)}
        currentTier={sub?.tier ?? null}
        activeOrgId={activeOrg?.id ?? null}
      />
    </main>
  );
}
