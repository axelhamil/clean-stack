import { Badge } from "@packages/ui/components/ui/badge";
import { NavLink } from "@packages/ui/components/ui/nav-link";
import { PageHeader } from "@packages/ui/components/ui/page-header";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@packages/ui/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@packages/ui/components/ui/table";
import { useFormatDateTime } from "@packages/web-kit/i18n/use-format-date";
import { useInfiniteQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { requireSection } from "../../shared/auth/require-section";
import { QueryList } from "../../shared/components/query-list";
import { StaffPage } from "../../shared/components/staff-page";
import { approvalsInfiniteQueryOptions } from "./api/approvals.queries";
import { approvalActionLabelKey } from "./approval-labels";
import { APPROVAL_STATUSES, approvalsSearchSchema } from "./approvals-search";

const ALL = "all";

export const Route = createFileRoute("/_staff/approvals")({
  validateSearch: approvalsSearchSchema,
  beforeLoad: requireSection("approvals"),
  component: ApprovalsPage,
});

function ApprovalsPage() {
  const { t } = useTranslation("admin");
  const formatDateTime = useFormatDateTime();
  const { status } = Route.useSearch();
  const navigate = Route.useNavigate();
  const query = useInfiniteQuery(approvalsInfiniteQueryOptions(status));

  return (
    <StaffPage>
      <PageHeader title={t("approvals.pageTitle")} description={t("approvals.description")} />

      <Select
        value={status ?? ALL}
        onValueChange={(value) => {
          const next = APPROVAL_STATUSES.find((candidate) => candidate === value);
          void navigate({ search: { status: next }, replace: true });
        }}
      >
        <SelectTrigger aria-label={t("approvals.statusLabel")} className="w-full sm:w-44">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>{t("approvals.allStatuses")}</SelectItem>
          {APPROVAL_STATUSES.map((candidate) => (
            <SelectItem key={candidate} value={candidate}>
              {t(`approvals.status.${candidate}`)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <QueryList
        query={query}
        columns={3}
        loadingLabel={t("approvals.loading")}
        errorMessage={t("approvals.loadFailed")}
        emptyMessage={t("approvals.empty")}
      >
        {(approvals) => (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("approvals.table.action")}</TableHead>
                <TableHead>{t("approvals.table.status")}</TableHead>
                <TableHead className="hidden md:table-cell">
                  {t("approvals.table.requested")}
                </TableHead>
                <TableHead className="hidden md:table-cell">
                  {t("approvals.table.expires")}
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {approvals.map((approval) => {
                const labelKey = approvalActionLabelKey(approval.action);

                return (
                  <TableRow key={approval.id}>
                    <TableCell className="whitespace-normal wrap-anywhere">
                      <NavLink asChild variant="plain">
                        <Link to="/approvals/$id" params={{ id: approval.id }}>
                          {labelKey ? t(labelKey) : approval.action}
                        </Link>
                      </NavLink>
                    </TableCell>
                    <TableCell>
                      <Badge variant={approval.status === "pending" ? "secondary" : "outline"}>
                        {t(`approvals.status.${approval.status}`)}
                      </Badge>
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      {formatDateTime(approval.createdAt)}
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      {formatDateTime(approval.expiresAt)}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </QueryList>
    </StaffPage>
  );
}
