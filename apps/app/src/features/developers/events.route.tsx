import { TypographyH1, TypographyMuted } from "@packages/ui/components/ui/typography";
import { createFileRoute } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { EventTypesTable } from "./components/event-types-table";

export const Route = createFileRoute("/developers/events")({
  component: DevelopersEventsPage,
});

function DevelopersEventsPage() {
  const { t } = useTranslation("common");

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 p-6">
      <header className="flex flex-col gap-2">
        <TypographyH1 variant="page">{t("developers.eventsTitle")}</TypographyH1>
        <TypographyMuted>{t("developers.eventsIntro")}</TypographyMuted>
        <TypographyMuted>{t("developers.eventsEnglishNote")}</TypographyMuted>
      </header>
      <EventTypesTable />
    </main>
  );
}
