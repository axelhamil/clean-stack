import { pageContainerVariants } from "@packages/ui/components/ui/page-container";
import { TypographyH1, TypographyMuted } from "@packages/ui/components/ui/typography";
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
    <main className={cn(pageContainerVariants({ width: "prose" }), "flex flex-col gap-6 py-6")}>
      <header className="flex flex-col gap-2">
        <TypographyH1 variant="page">{t("developers.eventsTitle")}</TypographyH1>
        <TypographyMuted>{t("developers.eventsIntro")}</TypographyMuted>
        <TypographyMuted>{t("developers.eventsEnglishNote")}</TypographyMuted>
      </header>
      <EventTypesTable />
    </main>
  );
}
