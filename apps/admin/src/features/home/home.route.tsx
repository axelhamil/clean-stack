import { pageContainerVariants } from "@packages/ui/components/ui/page-container";
import { PageHeader } from "@packages/ui/components/ui/page-header";
import { cn } from "@packages/ui/libs/utils.js";
import { createFileRoute } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";

export const Route = createFileRoute("/_staff/")({
  component: HomePage,
});

function HomePage() {
  const { t } = useTranslation("admin");

  return (
    <main className={cn(pageContainerVariants(), "py-8")}>
      <PageHeader title={t("backOffice.home.title")} description={t("backOffice.home.empty")} />
    </main>
  );
}
