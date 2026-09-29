import { Card, CardContent, CardHeader, CardTitle } from "@packages/ui/components/ui/card";
import {
  DescriptionDetails,
  DescriptionItem,
  DescriptionList,
  DescriptionTerm,
} from "@packages/ui/components/ui/description-list";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@packages/ui/components/ui/table";
import { TypographyH1 } from "@packages/ui/components/ui/typography";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { isOrgRole, ROLE_LABEL_KEYS } from "../../shared/auth/role-labels";
import { useFormatDate } from "../../shared/i18n/use-format-date";
import { EMPTY_VALUE } from "../../shared/utils";
import { adminOrgDetailQueryOptions } from "./api/admin-orgs.queries";

export const Route = createFileRoute("/_protected/_shell/_admin/admin/orgs/$orgId")({
  component: AdminOrgDetailPage,
});

function AdminOrgDetailPage() {
  const { t } = useTranslation(["admin", "common"]);
  const formatDate = useFormatDate();
  const { orgId } = Route.useParams();

  const query = useQuery(adminOrgDetailQueryOptions(orgId));

  if (query.isLoading || query.isError || !query.data) {
    return (
      <main className="flex flex-col gap-6">
        <header>
          <TypographyH1 variant="page">{t("orgs.pageTitle")}</TypographyH1>
        </header>
        <p>{query.isLoading ? t("orgs.detail.loading") : t("orgs.detail.loadFailed")}</p>
      </main>
    );
  }

  const org = query.data;

  return (
    <main className="flex flex-col gap-6">
      <header>
        <TypographyH1 variant="page">{org.name}</TypographyH1>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>{t("orgs.detail.detailsTitle")}</CardTitle>
        </CardHeader>
        <CardContent>
          <DescriptionList layout="inline">
            <DescriptionItem>
              <DescriptionTerm>{t("orgs.detail.slugLabel")}</DescriptionTerm>
              <DescriptionDetails>{org.slug}</DescriptionDetails>
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
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("orgs.detail.membersTitle")}</CardTitle>
        </CardHeader>
        <CardContent>
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
                  <TableCell>{member.email}</TableCell>
                  <TableCell>
                    {isOrgRole(member.role) ? t(ROLE_LABEL_KEYS[member.role]) : member.role}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </main>
  );
}
