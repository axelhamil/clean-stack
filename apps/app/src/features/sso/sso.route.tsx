import { Alert, AlertDescription } from "@packages/ui/components/ui/alert";
import { Button } from "@packages/ui/components/ui/button";
import { Skeleton, SkeletonGroup } from "@packages/ui/components/ui/skeleton";
import { TypographyH1, TypographyMuted } from "@packages/ui/components/ui/typography";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { ensureOrgPermission } from "../../shared/auth/ensure-org-permission";
import { useEntitlements } from "../../shared/auth/use-entitlements";
import { ssoProvidersQueryOptions } from "./api/sso.queries";
import { DomainVerificationCard } from "./components/domain-verification-card";
import { ProviderCard } from "./components/provider-card";
import { ScimConnectionCard } from "./components/scim-connection-card";
import { SsoEnforcementCard } from "./components/sso-enforcement-card";

export const Route = createFileRoute("/_protected/_shell/settings/_org-scope/sso")({
  // Registering a provider or a SCIM connection requires org owner/admin, the same
  // role floor `organization: ["update"]` already encodes, so gate the whole page
  // there rather than letting members reach a page full of controls that 403.
  beforeLoad: ensureOrgPermission({ organization: ["update"] }),
  component: SsoPage,
});

function SsoPage() {
  const { t } = useTranslation("settings");
  const { hasFeature } = useEntitlements();

  return (
    <main className="flex flex-col gap-8">
      <TypographyH1 variant="page">{t("sso.pageTitle")}</TypographyH1>
      {hasFeature("sso") ? <SsoSections /> : <SsoUpsell />}
    </main>
  );
}

function SsoSections() {
  const { t } = useTranslation(["settings", "errors"]);
  const providers = useQuery(ssoProvidersQueryOptions);

  if (providers.isPending) {
    return <SsoSectionsSkeleton label={t("settings:sso.loading")} />;
  }

  if (providers.isError) {
    return (
      <Alert variant="destructive">
        <AlertDescription>{t("errors:fallback.loadSsoProviders")}</AlertDescription>
      </Alert>
    );
  }

  return (
    <>
      <ProviderCard />
      <DomainVerificationCard />
      <SsoEnforcementCard />
      <ScimConnectionCard />
    </>
  );
}

const SKELETON_SECTIONS = ["provider", "domain", "enforcement", "scim"] as const;

interface SsoSectionsSkeletonProps {
  label: string;
}

function SsoSectionsSkeleton({ label }: SsoSectionsSkeletonProps) {
  return (
    <SkeletonGroup label={label} className="gap-8">
      {SKELETON_SECTIONS.map((section) => (
        <div key={section} className="flex flex-col gap-4 lg:grid lg:grid-cols-3 lg:gap-8">
          <div className="flex flex-col gap-2">
            <Skeleton className="h-5 w-32" />
            <Skeleton className="h-4 w-full" />
          </div>
          <Skeleton className="h-24 w-full lg:col-span-2" />
        </div>
      ))}
    </SkeletonGroup>
  );
}

function SsoUpsell() {
  const { t } = useTranslation("settings");

  return (
    <section className="flex max-w-prose flex-col items-start gap-4">
      <TypographyMuted>{t("sso.upsell.description")}</TypographyMuted>
      <Button asChild>
        <Link to="/pricing" search={{ plan: "business" }}>
          {t("sso.upsell.upgradeAction")}
        </Link>
      </Button>
    </section>
  );
}
