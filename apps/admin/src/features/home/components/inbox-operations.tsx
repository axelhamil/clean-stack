import { Badge } from "@packages/ui/components/ui/badge";
import { ListRow, ListRowContent } from "@packages/ui/components/ui/list-row";
import { NavLink } from "@packages/ui/components/ui/nav-link";
import { TypographyH2, TypographyMuted } from "@packages/ui/components/ui/typography";
import { useFormatDateTime } from "@packages/web-kit/i18n/use-format-date";
import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";

export interface InboxOperationsProps {
  deadEvents: number;
  deadEmails: number;
  deadWebhooks: number;
  failedSweeps: { label: string; outcome: string; finishedAt: string }[];
}

export function InboxOperations({
  deadEvents,
  deadEmails,
  deadWebhooks,
  failedSweeps,
}: InboxOperationsProps) {
  const { t } = useTranslation("admin");
  const formatDateTime = useFormatDateTime();
  const queues = [
    {
      key: "events",
      count: deadEvents,
      label: t("backOffice.inbox.deadEvents", { count: deadEvents }),
    },
    {
      key: "emails",
      count: deadEmails,
      label: t("backOffice.inbox.deadEmails", { count: deadEmails }),
    },
    {
      key: "webhooks",
      count: deadWebhooks,
      label: t("backOffice.inbox.deadWebhooks", { count: deadWebhooks }),
    },
  ].filter((queue) => queue.count > 0);

  return (
    <section className="flex min-w-0 flex-col gap-4">
      <TypographyH2>{t("backOffice.inbox.operationsTitle")}</TypographyH2>
      <ul className="flex flex-col gap-2">
        {queues.map((queue) => (
          <ListRow key={queue.key}>
            <NavLink asChild variant="plain">
              <Link to="/operations">{queue.label}</Link>
            </NavLink>
          </ListRow>
        ))}
        {failedSweeps.map((run) => (
          <ListRow key={run.label}>
            <ListRowContent className="min-w-0 wrap-anywhere">
              <NavLink asChild variant="plain">
                <Link to="/operations">{run.label}</Link>
              </NavLink>
              <TypographyMuted>
                {t("backOffice.inbox.lastRun", { date: formatDateTime(run.finishedAt) })}
              </TypographyMuted>
            </ListRowContent>
            <Badge variant="destructive">
              {t(
                run.outcome === "failed"
                  ? "operations.jobs.outcomes.failed"
                  : "operations.jobs.outcomes.batchError",
              )}
            </Badge>
          </ListRow>
        ))}
      </ul>
    </section>
  );
}
