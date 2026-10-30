import { pageContainerVariants } from "@packages/ui/components/ui/page-container";
import { PageHeader } from "@packages/ui/components/ui/page-header";
import { SettingsSection } from "@packages/ui/components/ui/settings-section";
import { TypographyMuted, TypographyP } from "@packages/ui/components/ui/typography";
import { cn } from "@packages/ui/libs/utils.js";
import { createFileRoute } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { displayName } from "../../shared/utils";

export const Route = createFileRoute("/_protected/_shell/dashboard")({
  component: DashboardPage,
});

function DashboardPage() {
  const { t } = useTranslation("common");
  const { user } = Route.useRouteContext();
  const firstName = displayName(user).split(" ")[0] ?? "";

  return (
    <main className={cn(pageContainerVariants(), "flex flex-col gap-8 py-10")}>
      <PageHeader
        title={t("dashboard.welcome", { name: firstName })}
        description={t("dashboard.subtitle")}
      />

      <SettingsSection
        title={t("dashboard.gettingStartedTitle")}
        description={t("dashboard.gettingStartedDescription")}
      >
        <TypographyP>{t("dashboard.gettingStartedBody")}</TypographyP>
      </SettingsSection>

      <SettingsSection
        title={t("dashboard.activityTitle")}
        description={t("dashboard.activityDescription")}
      >
        <TypographyMuted>{t("dashboard.activityEmpty")}</TypographyMuted>
      </SettingsSection>

      <SettingsSection
        title={t("dashboard.usageTitle")}
        description={t("dashboard.usageDescription")}
      >
        <TypographyMuted>{t("dashboard.usageEmpty")}</TypographyMuted>
      </SettingsSection>
    </main>
  );
}
