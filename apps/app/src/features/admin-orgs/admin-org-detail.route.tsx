import {
  DescriptionDetails,
  DescriptionItem,
  DescriptionList,
  DescriptionTerm,
} from "@packages/ui/components/ui/description-list";
import { LoadErrorAlert } from "@packages/ui/components/ui/load-error-alert";
import { NavLink } from "@packages/ui/components/ui/nav-link";
import { PageHeader } from "@packages/ui/components/ui/page-header";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@packages/ui/components/ui/table";
import { TypographyH2, TypographyMuted } from "@packages/ui/components/ui/typography";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { useTranslation } from "react-i18next";
import { ensureStaffPermission } from "../../shared/auth/ensure-staff";
import { isOrgRole, ROLE_LABEL_KEYS } from "../../shared/auth/role-labels";
import { useFormatDate } from "../../shared/i18n/use-format-date";
import { EMPTY_VALUE } from "../../shared/utils";
import { adminOrgDetailQueryOptions } from "./api/admin-orgs.queries";

export const Route = createFileRoute("/_protected/_shell/_admin/admin/orgs/$orgId")({
  beforeLoad: ensureStaffPermission("orgs.read"),
  component: AdminOrgDetailPage,
});

function AdminOrgDetailPage() {
  const { t } = useTranslation(["admin", "common"]);
  const formatDate = useFormatDate();
  const { orgId } = Route.useParams();

  const query = useQuery(adminOrgDetailQueryOptions(orgId));
  const org = query.data;

  const backLink = (
    <NavLink asChild variant="plain" className="gap-1 self-start">
      <Link to="/admin/orgs">
        <ArrowLeft className="size-4" aria-hidden />
        {t("orgs.pageTitle")}
      </Link>
    </NavLink>
  );

  if (!org) {
    return (
      <main className="flex flex-col gap-6">
        <div className="flex flex-col gap-2">
          {backLink}
          <PageHeader title={t("orgs.pageTitle")} />
        </div>
        {query.isError ? (
          <LoadErrorAlert message={t("orgs.detail.loadFailed")} />
        ) : (
          <TypographyMuted>{t("orgs.detail.loading")}</TypographyMuted>
        )}
      </main>
    );
  }

  return (
    <main className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        {backLink}
        <PageHeader title={org.name} />
      </div>

      <div className="grid gap-8 md:grid-cols-2">
        <section className="flex min-w-0 flex-col gap-4">
          <TypographyH2>{t("orgs.detail.detailsTitle")}</TypographyH2>
          <DescriptionList layout="inline">
            <DescriptionItem className="gap-4">
              <DescriptionTerm className="shrink-0">{t("orgs.detail.slugLabel")}</DescriptionTerm>
              <DescriptionDetails className="min-w-0 break-all">{org.slug}</DescriptionDetails>
            </DescriptionItem>
            <DescriptionItem>
              <DescriptionTerm>{t("orgs.detail.planLabel")}</DescriptionTerm>
              <DescriptionDetails>{org.plan ?? EMPTY_VALUE}</DescriptionDetails>
            </DescriptionItem>
            <DescriptionItem>
              <DescriptionTerm>{t("orgs.detail.createdLabel")}</DescriptionTerm>
              <DescriptionDetails>{formatDate(org.createdAt)}</DescriptionDetails>
            </DescriptionItem>
          </DescriptionList>
        </section>

        <section className="flex min-w-0 flex-col gap-4">
          <TypographyH2>{t("orgs.detail.membersTitle")}</TypographyH2>
          {org.members.length === 0 ? (
            <TypographyMuted>{t("orgs.detail.membersEmpty")}</TypographyMuted>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("orgs.detail.table.email")}</TableHead>
                  <TableHead>{t("orgs.detail.table.role")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {org.members.map((member) => (
                  <TableRow key={member.userId}>
                    <TableCell className="break-all whitespace-normal">{member.email}</TableCell>
                    <TableCell>
                      {isOrgRole(member.role) ? t(ROLE_LABEL_KEYS[member.role]) : member.role}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </section>
      </div>
    </main>
  );
}
