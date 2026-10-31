import { Badge } from "@packages/ui/components/ui/badge";
import { ListRow, ListRowContent } from "@packages/ui/components/ui/list-row";
import { NavLink } from "@packages/ui/components/ui/nav-link";
import { TypographyH2, TypographyMuted } from "@packages/ui/components/ui/typography";
import { useFormatDateTime } from "@packages/web-kit/i18n/use-format-date";
import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { LoadErrorRetry } from "../../../shared/components/load-error-retry";
import { sweepStateView } from "../../../shared/labels/sweep-outcome";
import type { Inbox } from "../api/inbox.queries";

export interface InboxOperationsProps {
  queues: Inbox["queues"];
  sweeps: Inbox["sweeps"];
  onRetry: () => unknown;
}

export function InboxOperations({ queues, sweeps, onRetry }: InboxOperationsProps) {
  const { t } = useTranslation("admin");
  const formatDateTime = useFormatDateTime();
  const counts = queues?.status === "ok" ? queues : null;
  const deadQueues = [
    {
      key: "events",
      count: counts?.deadEvents ?? 0,
      label: t("backOffice.inbox.deadEvents", { count: counts?.deadEvents ?? 0 }),
    },
    {
      key: "emails",
      count: counts?.deadEmails ?? 0,
      label: t("backOffice.inbox.deadEmails", { count: counts?.deadEmails ?? 0 }),
    },
    {
      key: "webhooks",
      count: counts?.deadWebhooks ?? 0,
      label: t("backOffice.inbox.deadWebhooks", { count: counts?.deadWebhooks ?? 0 }),
    },
  ].filter((queue) => queue.count > 0);
  const runs = sweeps?.status === "ok" ? sweeps.items : [];

  return (
    <section className="flex min-w-0 flex-col gap-4">
      <TypographyH2>{t("backOffice.inbox.operationsTitle")}</TypographyH2>
      {queues?.status === "failed" && (
        <LoadErrorRetry message={t("backOffice.inbox.queuesFailed")} onRetry={onRetry} />
      )}
      {sweeps?.status === "failed" && (
        <LoadErrorRetry message={t("backOffice.inbox.sweepsFailed")} onRetry={onRetry} />
      )}
      {deadQueues.length + runs.length > 0 && (
        <ul className="flex flex-col gap-2">
          {deadQueues.map((queue) => (
            <ListRow key={queue.key}>
              <NavLink asChild variant="plain">
                <Link to="/operations">{queue.label}</Link>
              </NavLink>
            </ListRow>
          ))}
          {runs.map((run) => {
            const state = sweepStateView(run);

            return (
              <ListRow key={run.label}>
                <ListRowContent className="min-w-0 wrap-anywhere">
                  <NavLink asChild variant="plain">
                    <Link to="/operations">{run.label}</Link>
                  </NavLink>
                  <TypographyMuted>
                    {t("backOffice.inbox.lastRun", { date: formatDateTime(run.finishedAt) })}
                  </TypographyMuted>
                </ListRowContent>
                <Badge variant={state.variant}>{t(state.labelKey)}</Badge>
              </ListRow>
            );
          })}
        </ul>
      )}
    </section>
  );
}
