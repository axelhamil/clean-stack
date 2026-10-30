import { pageContainerVariants } from "@packages/ui/components/ui/page-container";
import { PageHeader } from "@packages/ui/components/ui/page-header";
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
    <main className={cn(pageContainerVariants({ width: "form" }), "flex flex-col gap-8 py-8")}>
      <PageHeader title={t("orgNew.title")} description={t("orgNew.subtitle")} />
      <CreateOrgForm />
    </main>
  );
}
