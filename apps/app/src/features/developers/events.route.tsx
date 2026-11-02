import { pageContainerVariants } from "@packages/ui/components/ui/page-container";
import { PageHeader } from "@packages/ui/components/ui/page-header";
import { TypographyMuted } from "@packages/ui/components/ui/typography";
import { cn } from "@packages/ui/libs/utils.js";
import { createFileRoute } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { EventTypesTable } from "./components/event-types-table";

export const Route = createFileRoute("/developers/events")({
  component: DevelopersEventsPage,
});

function DevelopersEventsPage() {
  const { t } = useTranslation("common");

  return (
    <main className={cn(pageContainerVariants({ width: "prose" }), "flex flex-col gap-8 py-8")}>
      <PageHeader
        title={t("developers.eventsTitle")}
        description={
          <>
            <TypographyMuted>{t("developers.eventsIntro")}</TypographyMuted>
            <TypographyMuted>{t("developers.eventsEnglishNote")}</TypographyMuted>
          </>
        }
      />
      <EventTypesTable />
    </main>
  );
}
