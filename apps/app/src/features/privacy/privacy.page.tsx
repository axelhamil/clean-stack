import { TypographyH1 } from "@packages/ui/components/ui/typography";
import { getRouteApi } from "@tanstack/react-router";
import { ConsentSettings } from "../../shared/components/consent-settings";
import { DataExportCard } from "../rgpd/components/data-export-card";
import { SessionsCard } from "../security/components/sessions-card";
import { DataSourcesCard } from "./components/data-sources-card";
import { PolicyAcceptanceCard } from "./components/policy-acceptance-card";

const route = getRouteApi("/_protected/_shell/settings/privacy");

export function PrivacyPage() {
  const { user, sessionToken } = route.useRouteContext();

  return (
    <main className="flex flex-col gap-6">
      <TypographyH1 className="sr-only">Privacy &amp; data</TypographyH1>
      <PolicyAcceptanceCard />
      <ConsentSettings />
      <DataSourcesCard />
      <DataExportCard lastExportRequestedAt={user.lastExportRequestedAt} />
      <SessionsCard currentSessionToken={sessionToken} />
    </main>
  );
}
