import { Button } from "@packages/ui/components/ui/button";
import { pageContainerVariants } from "@packages/ui/components/ui/page-container";
import { PageHeader } from "@packages/ui/components/ui/page-header";
import { cn } from "@packages/ui/libs/utils.js";
import { useTranslation } from "react-i18next";

export function AppErrorFallback() {
  const { t } = useTranslation();

  return (
    <main className={cn(pageContainerVariants({ width: "form" }), "flex flex-col gap-6 py-16")}>
      <PageHeader title={t("errorBoundary.title")} description={t("errorBoundary.body")} />
      <Button variant="outline" className="w-fit" onClick={() => window.location.reload()}>
        {t("actions.reload")}
      </Button>
    </main>
  );
}
