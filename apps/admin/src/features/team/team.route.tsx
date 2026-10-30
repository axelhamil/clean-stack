import { Badge } from "@packages/ui/components/ui/badge";
import { PageHeader } from "@packages/ui/components/ui/page-header";
import { SkeletonTable } from "@packages/ui/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@packages/ui/components/ui/table";
import { TypographyMuted } from "@packages/ui/components/ui/typography";
import { useFormatDate } from "@packages/web-kit/i18n/use-format-date";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { requireSection } from "../../shared/auth/require-section";
import { useStaff } from "../../shared/auth/use-staff";
import { AwaitingApprovalNotice } from "../../shared/components/awaiting-approval-notice";
import { LoadErrorRetry } from "../../shared/components/load-error-retry";
import { StaffPage } from "../../shared/components/staff-page";
import { staffQueryOptions } from "./api/team.queries";
import { AddStaffDialog } from "./components/add-staff-dialog";
import { ManageMemberDialog } from "./components/manage-member-dialog";
import { STAFF_ROLE_LABEL_KEYS } from "./team-labels";

export const Route = createFileRoute("/_staff/team")({
  beforeLoad: requireSection("team"),
  component: TeamPage,
});

function TeamPage() {
  const { t } = useTranslation("admin");
  const formatDate = useFormatDate();
  const { can, me } = useStaff();
  const [awaitingId, setAwaitingId] = useState<string | null>(null);
  const query = useQuery(staffQueryOptions);

  return (
    <StaffPage>
      <PageHeader
        title={t("team.pageTitle")}
        actions={can("users.read") && <AddStaffDialog onAwaiting={setAwaitingId} />}
      />

      {awaitingId && (
        <AwaitingApprovalNotice approvalId={awaitingId} onClosed={() => setAwaitingId(null)} />
      )}

      {query.isPending && <SkeletonTable label={t("team.loading")} columns={3} />}

      {query.isError && <LoadErrorRetry message={t("team.loadFailed")} onRetry={query.refetch} />}

      {query.data?.items.length === 0 && <TypographyMuted>{t("team.empty")}</TypographyMuted>}

      {query.data && query.data.items.length > 0 && (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("team.table.person")}</TableHead>
              <TableHead>{t("team.table.role")}</TableHead>
              <TableHead className="hidden md:table-cell">{t("team.table.since")}</TableHead>
              <TableHead>
                <span className="sr-only">{t("team.manage")}</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {query.data.items.map((member) => (
              <TableRow key={member.userId}>
                <TableCell className="whitespace-normal wrap-anywhere">
                  {member.name || member.email}
                  {member.name && <TypographyMuted>{member.email}</TypographyMuted>}
                </TableCell>
                <TableCell>
                  <Badge variant="secondary">{t(STAFF_ROLE_LABEL_KEYS[member.role])}</Badge>
                </TableCell>
                <TableCell className="hidden md:table-cell">
                  {formatDate(member.createdAt)}
                </TableCell>
                <TableCell>
                  {member.userId === me.id && <TypographyMuted>{t("team.you")}</TypographyMuted>}
                  {member.userId !== me.id && member.source === "env" && (
                    <TypographyMuted>{t("team.listed")}</TypographyMuted>
                  )}
                  {member.userId !== me.id && member.source !== "env" && (
                    <ManageMemberDialog member={member} onAwaiting={setAwaitingId} />
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </StaffPage>
  );
}
