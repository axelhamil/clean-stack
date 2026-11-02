import { PageHeader } from "@packages/ui/components/ui/page-header";
import { SkeletonTable } from "@packages/ui/components/ui/skeleton";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { LoadErrorRetry } from "../../shared/components/load-error-retry";
import { StaffPage } from "../../shared/components/staff-page";
import { inboxQueryOptions } from "./api/inbox.queries";
import { InboxApprovals } from "./components/inbox-approvals";
import { InboxOperations } from "./components/inbox-operations";

export const Route = createFileRoute("/_staff/")({
  component: HomePage,
});

function HomePage() {
  const { t } = useTranslation("admin");
  const query = useQuery(inboxQueryOptions);
  const approvals = query.data?.approvals;
  const queues = query.data?.queues;
  const sweeps = query.data?.sweeps;
  const showsApprovals = approvals?.status === "failed" || (approvals?.total ?? 0) > 0;
  const hasDeadQueues =
    queues?.status === "ok" && queues.deadEvents + queues.deadEmails + queues.deadWebhooks > 0;
  const showsOperations =
    queues?.status === "failed" ||
    sweeps?.status === "failed" ||
    hasDeadQueues ||
    (sweeps?.status === "ok" && sweeps.items.length > 0);
  const isQuiet = query.data != null && !showsApprovals && !showsOperations;
  const isClosed = query.data != null && approvals == null && queues == null && sweeps == null;

  return (
    <StaffPage>
      <PageHeader
        title={t("backOffice.home.title")}
        description={
          isQuiet ? t(isClosed ? "backOffice.home.empty" : "backOffice.inbox.quiet") : undefined
        }
      />

      {query.isPending && <SkeletonTable label={t("backOffice.inbox.loading")} columns={1} />}

      {query.isError && (
        <LoadErrorRetry message={t("backOffice.inbox.loadFailed")} onRetry={query.refetch} />
      )}

      {approvals && showsApprovals && (
        <InboxApprovals approvals={approvals} onRetry={query.refetch} />
      )}
      {queues !== undefined && sweeps !== undefined && showsOperations && (
        <InboxOperations queues={queues} sweeps={sweeps} onRetry={query.refetch} />
      )}
    </StaffPage>
  );
}
