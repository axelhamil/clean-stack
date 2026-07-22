import { TypographyH1, TypographyMuted } from "@packages/ui/components/ui/typography";
import { EventTypesTable } from "./components/event-types-table";

export function DevelopersEventsPage() {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 p-6">
      <header className="flex flex-col gap-2">
        <TypographyH1 variant="page">Event catalog</TypographyH1>
        <TypographyMuted>
          All subscribable events emitted by this platform. Subscribe to any of these via a webhook
          endpoint in your organization settings.
        </TypographyMuted>
      </header>
      <EventTypesTable />
    </main>
  );
}
