import { TypographyH1 } from "@packages/ui/components/ui/typography";
import { createFileRoute } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { ConsentSettings } from "../../shared/components/consent-settings";
import { DataExportCard } from "../rgpd/components/data-export-card";
import { SessionsCard } from "../security/components/sessions-card";
import { DataSourcesCard } from "./components/data-sources-card";
import { PolicyAcceptanceCard } from "./components/policy-acceptance-card";

export const Route = createFileRoute("/_protected/_shell/settings/privacy")({
  component: PrivacyPage,
});

function PrivacyPage() {
  const { user, sessionToken } = Route.useRouteContext();
  const { t } = useTranslation("settings");

  return (
    <main className="flex flex-col gap-6">
      <TypographyH1 className="sr-only">{t("privacy.pageTitle")}</TypographyH1>
      <PolicyAcceptanceCard />
      <ConsentSettings />
      <DataSourcesCard />
      <DataExportCard lastExportRequestedAt={user.lastExportRequestedAt} />
      <SessionsCard currentSessionToken={sessionToken} />
    </main>
  );
}
