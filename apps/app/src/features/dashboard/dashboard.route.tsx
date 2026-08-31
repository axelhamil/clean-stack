import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@packages/ui/components/ui/card";
import { TypographyH1, TypographyMuted, TypographyP } from "@packages/ui/components/ui/typography";
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
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-6 py-10">
      <header className="flex flex-col gap-1">
        <TypographyH1 variant="page">{t("dashboard.welcome", { name: firstName })}</TypographyH1>
        <TypographyMuted>{t("dashboard.subtitle")}</TypographyMuted>
      </header>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>{t("dashboard.gettingStartedTitle")}</CardTitle>
            <CardDescription>{t("dashboard.gettingStartedDescription")}</CardDescription>
          </CardHeader>
          <CardContent>
            <TypographyP>{t("dashboard.gettingStartedBody")}</TypographyP>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t("dashboard.activityTitle")}</CardTitle>
            <CardDescription>{t("dashboard.activityDescription")}</CardDescription>
          </CardHeader>
          <CardContent>
            <TypographyMuted>{t("dashboard.activityEmpty")}</TypographyMuted>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t("dashboard.usageTitle")}</CardTitle>
            <CardDescription>{t("dashboard.usageDescription")}</CardDescription>
          </CardHeader>
          <CardContent>
            <TypographyMuted>{t("dashboard.usageEmpty")}</TypographyMuted>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
