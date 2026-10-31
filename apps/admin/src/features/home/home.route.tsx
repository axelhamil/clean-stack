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
  const operations = query.data?.operations;
  const hasApprovals = (approvals?.total ?? 0) > 0;
  const hasOperations =
    operations != null &&
    operations.deadEvents +
      operations.deadEmails +
      operations.deadWebhooks +
      operations.failedSweeps.length >
      0;
  const isQuiet = query.data != null && !hasApprovals && !hasOperations;
  const isClosed = query.data != null && approvals == null && operations == null;

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

      {approvals && hasApprovals && <InboxApprovals {...approvals} />}
      {operations && hasOperations && <InboxOperations {...operations} />}
    </StaffPage>
  );
}
