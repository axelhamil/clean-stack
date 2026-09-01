import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@packages/ui/components/ui/card";
import { pageContainerVariants } from "@packages/ui/components/ui/page-container";
import { TypographyH1, TypographyMuted } from "@packages/ui/components/ui/typography";
import { cn } from "@packages/ui/libs/utils.js";
import { createFileRoute } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { CreateOrgForm } from "./forms/create-org-form";

export const Route = createFileRoute("/_protected/_shell/org/new")({
  component: CreateOrgPage,
});

function CreateOrgPage() {
  const { t } = useTranslation("common");

  return (
    <main className={cn(pageContainerVariants({ width: "form" }), "flex flex-col gap-6 py-10")}>
      <header className="flex flex-col gap-1">
        <TypographyH1 variant="page">{t("orgNew.title")}</TypographyH1>
        <TypographyMuted>{t("orgNew.subtitle")}</TypographyMuted>
      </header>
      <Card>
        <CardHeader>
          <CardTitle>{t("orgNew.detailsTitle")}</CardTitle>
          <CardDescription>{t("orgNew.detailsDescription")}</CardDescription>
        </CardHeader>
        <CardContent>
          <CreateOrgForm />
        </CardContent>
      </Card>
    </main>
  );
}
